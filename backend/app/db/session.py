"""Creation du moteur SQLAlchemy et des sessions."""

from collections.abc import Generator

from fastapi import Request
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import Settings, get_settings


def create_session_factory(settings: Settings | None = None) -> sessionmaker[Session]:
    """Creer un moteur compatible SQLite en local et MySQL en production."""
    active_settings = settings or get_settings()
    connect_args = (
        {"check_same_thread": False}
        if active_settings.database_url.startswith("sqlite")
        else {}
    )
    engine = create_engine(
        active_settings.database_url,
        connect_args=connect_args,
        pool_pre_ping=not active_settings.database_url.startswith("sqlite"),
    )
    return sessionmaker(bind=engine, autoflush=False, autocommit=False)


def get_db(request: Request) -> Generator[Session, None, None]:
    """Fournir une session SQLAlchemy et la fermer apres la requete."""
    session_factory = request.app.state.session_factory
    db = session_factory()
    try:
        yield db
    finally:
        db.close()
