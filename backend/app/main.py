"""Point d'entree de l'API Chez Maty."""

from contextlib import asynccontextmanager
from collections.abc import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi import _rate_limit_exceeded_handler
from sqlalchemy.orm import sessionmaker

from app.api.routes.auth import router as auth_router
from app.api.routes.catalog import router as catalog_router
from app.api.routes.customer import router as customer_router
from app.api.routes.favorites import router as favorites_router
from app.api.routes.payments import router as payments_router
from app.core.config import Settings, get_settings
from app.core.rate_limit import limiter
from app.db.base import Base
from app.db.migrations import migrate_cart_item_customizations
from app.db.seed_catalog import seed_catalog, sync_sandbox_payment_product
from app.db.session import create_session_factory
from app.models import Base as ModelBase

# Importer les modeles pour enregistrer leurs tables dans la base declarative.
_ = ModelBase.metadata.tables


def create_app(
    settings: Settings | None = None,
    session_factory: sessionmaker | None = None,
) -> FastAPI:
    """Construire l'application avec une configuration injectable pour les tests."""
    active_settings = settings or get_settings()
    active_session_factory = session_factory or create_session_factory(active_settings)

    @asynccontextmanager
    async def lifespan(application: FastAPI) -> AsyncIterator[None]:
        """Initialiser le schema et appliquer les migrations connues au demarrage."""
        engine = active_session_factory.kw["bind"]
        migrate_cart_item_customizations(engine)
        Base.metadata.create_all(bind=engine)
        if active_settings.app_env == "production":
            seed_catalog(active_session_factory)
            sync_sandbox_payment_product(
                active_session_factory,
                enabled=active_settings.payment_sandbox,
            )
        yield

    application = FastAPI(
        title=active_settings.app_name,
        version="0.1.0",
        debug=active_settings.debug,
        lifespan=lifespan,
    )
    application.state.settings = active_settings
    application.state.session_factory = active_session_factory
    application.state.limiter = limiter
    active_settings.resolved_upload_dir.mkdir(parents=True, exist_ok=True)
    application.mount(
        "/uploads",
        StaticFiles(directory=active_settings.resolved_upload_dir),
        name="uploads",
    )
    application.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    application.add_middleware(SlowAPIMiddleware)
    application.add_middleware(
        CORSMiddleware,
        allow_origins=active_settings.allowed_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "X-CSRF-Token", "Authorization"],
    )
    application.include_router(auth_router, prefix="/api")
    application.include_router(catalog_router, prefix="/api")
    application.include_router(favorites_router, prefix="/api")
    application.include_router(customer_router, prefix="/api")
    application.include_router(payments_router, prefix="/api")

    @application.get("/health", tags=["Santé"])
    def health_check() -> dict[str, str]:
        """Indiquer que le processus API repond."""
        return {"status": "ok"}

    return application


app = create_app()
