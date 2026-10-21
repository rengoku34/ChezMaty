"""Classe declarative commune aux modeles SQLAlchemy."""

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Base de toutes les tables de l'application."""

