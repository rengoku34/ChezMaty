"""Tests du catalogue public, des favoris et des avis verifies."""

from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import Settings
from app.core.rate_limit import limiter
from app.db.session import create_session_factory
from app.main import create_app
from app.models import Category, Order, OrderItem, Product, Review, User


def build_client(tmp_path: Path) -> tuple[TestClient, sessionmaker[Session]]:
    """Construire une API et une base isolees pour un test."""
    limiter.reset()
    settings = Settings(
        _env_file=None,
        app_name="Chez Maty tests",
        app_env="development",
        secret_key="cle-test-catalogue-suffisamment-longue-987654",
        database_url=f"sqlite:///{(tmp_path / 'catalog.db').as_posix()}",
        cors_origins="http://localhost:5500",
        cookie_secure=False,
    )
    factory = create_session_factory(settings)
    return TestClient(create_app(settings, factory)), factory


def test_catalog_schema_is_initialized_in_production(tmp_path: Path) -> None:
    """Les routes publiques fonctionnent avec une base neuve en production."""
    limiter.reset()
    settings = Settings(
        _env_file=None,
        app_name="Chez Maty production tests",
        app_env="production",
        secret_key="cle-test-production-suffisamment-longue-987654",
        database_url=f"sqlite:///{(tmp_path / 'production.db').as_posix()}",
    )
    client = TestClient(create_app(settings, create_session_factory(settings)))

    with client:
        assert client.get("/api/products").status_code == 200
        assert client.get("/api/products").json() == []
        assert client.get("/api/categories").status_code == 200


def seed_catalog(factory: sessionmaker[Session]) -> tuple[int, int]:
    """Creer une categorie, un produit publie et un brouillon prive."""
    with factory() as db:
        category = Category(name="Coffrets naissance", slug="coffrets-naissance", is_visible=True)
        db.add(category)
        db.flush()
        published = Product(
            category_id=category.id,
            name="Coffret Awa",
            slug="coffret-awa",
            description="Un coffret personnalise pour bebe.",
            price_xof=15000,
            stock=3,
            recommended_age="0-12 mois",
            color="Rose",
            customization_options='{"prenom": true}',
            is_published=True,
        )
        draft = Product(
            category_id=category.id,
            name="Coffret brouillon",
            slug="coffret-brouillon",
            description="Ne doit pas etre visible.",
            price_xof=10000,
            stock=1,
            is_published=False,
        )
        db.add_all([published, draft])
        db.commit()
        return published.id, draft.id


def register_customer(client: TestClient) -> dict[str, str]:
    """Creer un client de test et retourner ses donnees publiques."""
    response = client.post(
        "/api/auth/register",
        json={
            "full_name": "Awa Kouassi",
            "email": "awa@example.com",
            "password": "motdepasse-catalogue-123",
        },
    )
    assert response.status_code == 201
    return response.json()["user"]


def test_catalog_filters_hide_unpublished_products(tmp_path: Path) -> None:
    """Filtrer le catalogue sans exposer les produits non publies."""
    client, factory = build_client(tmp_path)
    with client:
        published_id, draft_id = seed_catalog(factory)
        assert client.get("/api/categories").json()[0]["slug"] == "coffrets-naissance"

        filtered = client.get(
            "/api/products",
            params={
                "q": "Awa",
                "category": "coffrets-naissance",
                "min_price": 10000,
                "max_price": 20000,
                "age": "0-12",
                "color": "rose",
            },
        )
        assert filtered.status_code == 200
        assert [product["id"] for product in filtered.json()] == [published_id]
        assert client.get("/api/products/coffret-brouillon").status_code == 404
        assert client.get("/api/products?min_price=20000&max_price=10000").status_code == 422

        by_price = client.get("/api/products?sort=price_asc")
        assert by_price.status_code == 200
        assert all(product["id"] != draft_id for product in by_price.json())


def test_favorites_require_auth_and_csrf(tmp_path: Path) -> None:
    """Proteger la consultation et la modification des favoris."""
    client, factory = build_client(tmp_path)
    with client:
        product_id, _ = seed_catalog(factory)
        assert client.get("/api/favorites").status_code == 401
        register_customer(client)
        assert client.put(f"/api/favorites/{product_id}").status_code == 403

        csrf = client.cookies.get("csrf_token")
        added = client.put(f"/api/favorites/{product_id}", headers={"X-CSRF-Token": csrf})
        assert added.status_code == 204
        assert added.content == b""
        assert [product["id"] for product in client.get("/api/favorites").json()] == [product_id]

        assert client.put(
            f"/api/favorites/{product_id}",
            headers={"X-CSRF-Token": csrf},
        ).status_code == 204
        assert client.delete(
            f"/api/favorites/{product_id}",
            headers={"X-CSRF-Token": csrf},
        ).status_code == 204
        assert client.get("/api/favorites").json() == []


def test_reviews_require_delivered_purchase_and_moderation(tmp_path: Path) -> None:
    """N'accepter qu'un avis par achat livre et ne publier qu'apres moderation."""
    client, factory = build_client(tmp_path)
    with client:
        product_id, _ = seed_catalog(factory)
        customer = register_customer(client)
        with factory() as db:
            user = db.scalar(select(User).where(User.id == customer["id"]))
            assert user is not None
            order = Order(
                order_number="CM-TEST-0001",
                user_id=user.id,
                recipient_name=user.full_name,
                recipient_phone="0709109224",
                delivery_city="Abidjan",
                delivery_commune="Cocody",
                delivery_details="Adresse de test",
                total_xof=15000,
                status="livree",
            )
            db.add(order)
            db.flush()
            order_item = OrderItem(
                order_id=order.id,
                product_id=product_id,
                product_name="Coffret Awa",
                unit_price_xof=15000,
                quantity=1,
            )
            db.add(order_item)
            db.commit()
            order_item_id = order_item.id

        review_data = {
            "order_item_id": order_item_id,
            "rating": 5,
            "comment": "Un tres joli coffret, merci !",
        }
        csrf = client.cookies.get("csrf_token")
        submitted = client.post(
            "/api/products/coffret-awa/reviews",
            json=review_data,
            headers={"X-CSRF-Token": csrf},
        )
        assert submitted.status_code == 201
        assert submitted.json()["customer_name"] == "Client verifie"
        assert client.get("/api/products/coffret-awa/reviews").json()["total"] == 0

        duplicate = client.post(
            "/api/products/coffret-awa/reviews",
            json=review_data,
            headers={"X-CSRF-Token": csrf},
        )
        assert duplicate.status_code == 409

        with factory() as db:
            review = db.scalar(select(Review).where(Review.order_item_id == order_item_id))
            assert review is not None
            review.moderation_status = "approuve"
            db.commit()

        visible_reviews = client.get("/api/products/coffret-awa/reviews")
        assert visible_reviews.status_code == 200
        assert visible_reviews.json()["total"] == 1
        assert visible_reviews.json()["items"][0]["rating"] == 5
