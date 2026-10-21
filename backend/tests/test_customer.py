"""Tests des profils, adresses, paniers et commandes."""

from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import Settings
from app.core.rate_limit import limiter
from app.db.session import create_session_factory
from app.main import create_app
from app.models import Category, DeliveryZone, Product, User


def build_client(tmp_path: Path) -> tuple[TestClient, sessionmaker[Session]]:
    """Construire une API et une base isolees pour un test."""
    limiter.reset()
    settings = Settings(
        _env_file=None,
        app_name="Chez Maty tests",
        app_env="development",
        secret_key="cle-test-commandes-suffisamment-longue-123456",
        database_url=f"sqlite:///{(tmp_path / 'customer.db').as_posix()}",
        cors_origins="http://localhost:5500",
        cookie_secure=False,
    )
    factory = create_session_factory(settings)
    return TestClient(create_app(settings, factory)), factory


def seed_shop(factory: sessionmaker[Session]) -> int:
    """Ajouter un produit en stock et une zone de livraison."""
    with factory() as db:
        category = Category(name="Coffrets test", slug="coffrets-test", is_visible=True)
        db.add(category)
        db.flush()
        product = Product(
            category_id=category.id,
            name="Coffret de naissance",
            slug="coffret-naissance-test",
            description="Un cadeau personalise pour bebe.",
            price_xof=15000,
            stock=4,
            color="Rose",
            is_published=True,
        )
        db.add(product)
        db.add(
            DeliveryZone(
                city="Abidjan",
                commune="Cocody",
                is_active=True,
                delivery_hours=24,
                conditions="Livraison selon disponibilite.",
            )
        )
        db.commit()
        return product.id


def register(client: TestClient, email: str = "awa@example.com") -> int:
    """Creer un client de test et retourner son identifiant."""
    response = client.post(
        "/api/auth/register",
        json={
            "full_name": "Awa Kouassi",
            "email": email,
            "phone": "0709109224",
            "password": "motdepasse-client-123",
        },
    )
    assert response.status_code == 201
    return response.json()["user"]["id"]


def csrf_headers(client: TestClient) -> dict[str, str]:
    """Construire l'en-tete CSRF associe au cookie client."""
    return {"X-CSRF-Token": client.cookies.get("csrf_token")}


def test_profile_address_cart_and_order_checkout(tmp_path: Path) -> None:
    """Verifier le compte, la validation de livraison et le total recalcule."""
    client, factory = build_client(tmp_path)
    with client:
        product_id = seed_shop(factory)
        user_id = register(client)
        headers = csrf_headers(client)

        update_profile = client.patch(
            "/api/auth/me",
            json={
                "full_name": "  Awa   Traore ",
                "email_notifications_enabled": False,
            },
            headers=headers,
        )
        assert update_profile.status_code == 200
        assert update_profile.json()["full_name"] == "Awa Traore"
        assert update_profile.json()["email_notifications_enabled"] is False
        assert update_profile.json()["email"] == "awa@example.com"

        address_data = {
            "recipient_name": "Awa Traore",
            "phone": "0709109224",
            "city": "Abidjan",
            "commune": "Cocody",
            "details": "Riviera Bonoumin, carrefour test",
        }
        address_response = client.post("/api/addresses", json=address_data, headers=headers)
        assert address_response.status_code == 201
        address_id = address_response.json()["id"]
        assert address_response.json()["is_default"] is True
        assert len(client.get("/api/addresses").json()) == 1

        unsupplied_zone = dict(address_data, commune="Yopougon")
        other_address = client.post("/api/addresses", json=unsupplied_zone, headers=headers)
        assert other_address.status_code == 201
        rejected_address = client.post("/api/orders", json={"address_id": other_address.json()["id"]}, headers=headers)
        assert rejected_address.status_code == 422

        sync_response = client.put(
            "/api/cart",
            json={
                "items": [
                    {
                        "product_id": product_id,
                        "quantity": 1,
                        "customization": {
                            "prenom": "Mariam",
                            "couleur": "Rose poudré",
                            "message": "Bienvenue",
                        },
                    },
                    {
                        "product_id": product_id,
                        "quantity": 1,
                        "customization": {
                            "prenom": "Aïcha",
                            "couleur": "Violet",
                            "message": "",
                        },
                    }
                ]
            },
            headers=headers,
        )
        assert sync_response.status_code == 200
        assert sync_response.json()["total_xof"] == 30000
        assert len(sync_response.json()["items"]) == 2
        assert {item["customization"]["prenom"] for item in sync_response.json()["items"]} == {"Mariam", "Aïcha"}

        order_response = client.post(
            "/api/orders",
            json={"address_id": address_id},
            headers=headers,
        )
        assert order_response.status_code == 201
        order = order_response.json()
        assert order["total_xof"] == 30000
        assert order["status"] == "en_attente"
        assert order["delivery_commune"] == "Cocody"
        assert order["items"][0]["unit_price_xof"] == 15000
        assert {item["customization"]["prenom"] for item in order["items"]} == {"Mariam", "Aïcha"}
        assert client.get("/api/cart").json() == {"items": [], "total_xof": 0}
        assert client.get("/api/orders").json()["total"] == 1
        assert client.get(f"/api/orders/{order['id']}").json()["order_number"] == order["order_number"]

        with factory() as db:
            persisted_user = db.scalar(select(User).where(User.id == user_id))
            persisted_product = db.get(Product, product_id)
            assert persisted_user is not None
            assert persisted_product is not None
            assert persisted_product.stock == 4


def test_addresses_and_orders_are_private_and_csrf_protected(tmp_path: Path) -> None:
    """Ne pas exposer les ressources d'un compte a un autre."""
    client, factory = build_client(tmp_path)
    with client:
        seed_shop(factory)
        first_user = register(client)
        address_response = client.post(
            "/api/addresses",
            json={
                "recipient_name": "Awa Kouassi",
                "phone": "0709109224",
                "city": "Abidjan",
                "commune": "Cocody",
                "details": "Adresse du premier compte",
            },
            headers=csrf_headers(client),
        )
        assert address_response.status_code == 201
        first_address_id = address_response.json()["id"]
        assert client.delete(f"/api/addresses/{first_address_id}").status_code == 403
        assert client.put("/api/cart", json={"items": []}).status_code == 403

        logout = client.post("/api/auth/logout", headers=csrf_headers(client))
        assert logout.status_code == 204
        second_user = register(client, "mariam@example.com")
        assert first_user != second_user
        assert client.get("/api/addresses").json() == []
        assert client.get("/api/orders").json()["total"] == 0
        assert client.delete(
            f"/api/addresses/{first_address_id}",
            headers=csrf_headers(client),
        ).status_code == 404
