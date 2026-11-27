"""HTTP client with retry, backoff, rate limiting and tracing as middleware.

httpx transports compose, so the policy lives in one wrapper transport instead
of in every call site.
"""

from __future__ import annotations

import asyncio
import logging
import os
import random
import ssl
import time

import httpx

from . import telemetry
from .config import HttpSettings

log = logging.getLogger(__name__)
RETRY_STATUS: frozenset[int] = frozenset({429, 500, 502, 503, 504})


def _retry_after_s(resp: httpx.Response | None) -> float:
    """Seconds from a numeric Retry-After header; HTTP-date values fall back to backoff."""
    if resp is None:
        return 0.0
    try:
        return float(resp.headers.get("Retry-After", "0"))
    except ValueError:
        return 0.0


class _RateLimiter:
    """Token bucket shared by all requests of one client."""

    def __init__(self, rate_per_s: float) -> None:
        self._interval = 1.0 / rate_per_s
        self._next = 0.0
        self._lock = asyncio.Lock()

    async def wait(self) -> None:
        async with self._lock:
            now = time.monotonic()
            delay = self._next - now
            self._next = max(now, self._next) + self._interval
        if delay > 0:
            await asyncio.sleep(delay)


class PolicyTransport(httpx.AsyncBaseTransport):
    """Wraps a transport with rate limiting, retries with jittered backoff, and spans."""

    def __init__(self, inner: httpx.AsyncBaseTransport, settings: HttpSettings) -> None:
        self._inner = inner
        self._settings = settings
        self._limiter = _RateLimiter(settings.max_requests_per_s)
        self._tracer = telemetry.tracer(__name__)
        m = telemetry.meter(__name__)
        self._requests = m.create_counter("http.client.requests")
        self._retries = m.create_counter("http.client.retries")

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        s = self._settings
        with self._tracer.start_as_current_span("http.request") as span:
            span.set_attribute("http.method", request.method)
            span.set_attribute("url.full", str(request.url))
            for attempt in range(s.max_retries + 1):
                await self._limiter.wait()
                resp: httpx.Response | None = None
                try:
                    resp = await self._inner.handle_async_request(request)
                except (httpx.TransportError, httpx.TimeoutException) as exc:
                    if attempt == s.max_retries:
                        raise
                    log.warning("transport error %s on %s (attempt %d)", exc, request.url, attempt + 1)
                else:
                    self._requests.add(1, {"status": resp.status_code})
                    if resp.status_code not in RETRY_STATUS or attempt == s.max_retries:
                        span.set_attribute("http.status_code", resp.status_code)
                        span.set_attribute("retry.count", attempt)
                        return resp
                    await resp.aclose()
                    log.warning("HTTP %d on %s (attempt %d)", resp.status_code, request.url, attempt + 1)
                self._retries.add(1)
                retry_after = _retry_after_s(resp)
                delay = min(s.backoff_max_s, s.backoff_base_s * 2**attempt) * (0.5 + random.random())
                await asyncio.sleep(max(delay, retry_after))
        raise RuntimeError("unreachable")

    async def aclose(self) -> None:
        await self._inner.aclose()


def _base_transport() -> httpx.AsyncHTTPTransport:
    """Honour HTTPS_PROXY and SSL_CERT_FILE, which a custom transport otherwise ignores."""
    proxy = os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy")
    ca = os.environ.get("SSL_CERT_FILE")
    verify: ssl.SSLContext | bool = ssl.create_default_context(cafile=ca) if ca else True
    return httpx.AsyncHTTPTransport(proxy=proxy, verify=verify)


def client(settings: HttpSettings | None = None) -> httpx.AsyncClient:
    """An AsyncClient with the policy transport installed."""
    s = settings or HttpSettings()
    transport = PolicyTransport(_base_transport(), s)
    return httpx.AsyncClient(
        transport=transport,
        timeout=s.timeout_s,
        headers={"User-Agent": s.user_agent},
        follow_redirects=True,
    )
