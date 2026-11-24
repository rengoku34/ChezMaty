#!/usr/bin/env python
"""Django's command-line utility for administrative tasks."""

import os
import sys


def main():
    """Run administrative tasks."""
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        raise ImportError(
            "Couldn't import Django. Are you sure it's installed and "
            "available on your PYTHONPATH environment variable? Did you "
            "forget to activate a virtual environment?"
        ) from exc
    # « python manage.py runserver » écoute sur le port 8000 et sur tout le réseau : les téléphones et les autres PC peuvent ouvrir le site.
    from django.core.management.commands import runserver
    runserver.Command.default_addr = "0.0.0.0"
    execute_from_command_line(sys.argv)


if __name__ == "__main__":
    main()
