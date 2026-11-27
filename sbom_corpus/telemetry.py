"""OpenTelemetry setup: traces, metrics and logs for the corpus tools.

Uses the OTLP exporter when OTEL_EXPORTER_OTLP_ENDPOINT is set, otherwise the
console exporters only with --verbose, so a plain run stays quiet.
"""

from __future__ import annotations

import logging
import os

from opentelemetry import metrics, trace
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.metrics.export import ConsoleMetricExporter, PeriodicExportingMetricReader
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor, ConsoleSpanExporter

SERVICE_NAME: str = "sbom-corpus"
_configured: bool = False


def setup(verbose: bool = False) -> None:
    """Configure providers once per process."""
    global _configured
    if _configured:
        return
    _configured = True
    logging.basicConfig(
        level=logging.DEBUG if verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    for noisy in ("httpx", "httpcore"):
        logging.getLogger(noisy).setLevel(logging.DEBUG if verbose else logging.WARNING)
    resource = Resource.create({"service.name": SERVICE_NAME})
    tracer_provider = TracerProvider(resource=resource)
    readers = []
    if os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT"):
        try:
            from opentelemetry.exporter.otlp.proto.http.metric_exporter import OTLPMetricExporter
            from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter

            tracer_provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter()))
            readers.append(PeriodicExportingMetricReader(OTLPMetricExporter()))
        except ImportError:
            logging.getLogger(__name__).warning("OTLP exporter not installed; skipping")
    elif verbose:
        tracer_provider.add_span_processor(BatchSpanProcessor(ConsoleSpanExporter()))
        readers.append(PeriodicExportingMetricReader(ConsoleMetricExporter()))
    trace.set_tracer_provider(tracer_provider)
    metrics.set_meter_provider(MeterProvider(resource=resource, metric_readers=readers))


def tracer(name: str) -> trace.Tracer:
    return trace.get_tracer(name)


def meter(name: str) -> metrics.Meter:
    return metrics.get_meter(name)
