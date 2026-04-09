"""CLI entry point for the Hermes desktop sidecar."""

from __future__ import annotations

import logging
import sys

from hermes_constants import get_hermes_home


def _setup_logging() -> None:
    handler = logging.StreamHandler(sys.stderr)
    handler.setFormatter(
        logging.Formatter(
            "%(asctime)s [%(levelname)s] %(name)s: %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )
    )
    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(logging.INFO)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    logging.getLogger("openai").setLevel(logging.WARNING)


def _load_env() -> None:
    from hermes_cli.env_loader import load_hermes_dotenv

    hermes_home = get_hermes_home()
    load_hermes_dotenv(hermes_home=hermes_home)


def main() -> None:
    _setup_logging()
    _load_env()
    from .app import DesktopRuntime

    runtime = DesktopRuntime()
    try:
        runtime.run()
    except KeyboardInterrupt:
        logging.getLogger(__name__).info("Desktop runtime stopped")


if __name__ == "__main__":
    main()
