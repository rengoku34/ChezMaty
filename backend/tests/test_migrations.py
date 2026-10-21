"""Tests des migrations de schema locales."""

import sqlite3

from sqlalchemy import create_engine, inspect

from app.db.migrations import migrate_cart_item_customizations


def test_migrate_existing_sqlite_cart_rows_without_data_loss(tmp_path) -> None:
    """Supprimer l'unicite historique en preservant les lignes du panier."""
    database_path = tmp_path / "legacy.db"
    connection = sqlite3.connect(database_path)
    connection.executescript(
        """
        CREATE TABLE carts (
            id INTEGER NOT NULL PRIMARY KEY,
            user_id INTEGER NOT NULL UNIQUE,
            updated_at DATETIME NOT NULL
        );
        CREATE TABLE products (
            id INTEGER NOT NULL PRIMARY KEY,
            name VARCHAR(160) NOT NULL
        );
        CREATE TABLE cart_items (
            id INTEGER NOT NULL PRIMARY KEY,
            cart_id INTEGER NOT NULL,
            product_id INTEGER NOT NULL,
            quantity INTEGER NOT NULL,
            customization TEXT,
            CONSTRAINT ck_cart_item_quantity_positive CHECK (quantity > 0),
            CONSTRAINT uq_cart_item_product UNIQUE (cart_id, product_id),
            FOREIGN KEY(cart_id) REFERENCES carts (id) ON DELETE CASCADE,
            FOREIGN KEY(product_id) REFERENCES products (id)
        );
        INSERT INTO carts (id, user_id, updated_at) VALUES (1, 7, CURRENT_TIMESTAMP);
        INSERT INTO products (id, name) VALUES (1, 'Coffret Awa');
        INSERT INTO cart_items (id, cart_id, product_id, quantity, customization)
        VALUES (1, 1, 1, 2, '{"prenom":"Awa"}');
        """
    )
    connection.commit()
    connection.close()

    engine = create_engine(f"sqlite:///{database_path.as_posix()}")
    migrate_cart_item_customizations(engine)
    inspector = inspect(engine)
    assert inspector.get_unique_constraints("cart_items") == []
    with engine.begin() as migrated:
        rows = migrated.exec_driver_sql(
            "SELECT id, cart_id, product_id, quantity, customization FROM cart_items"
        ).all()
        migrated.exec_driver_sql(
            "INSERT INTO cart_items (cart_id, product_id, quantity, customization) "
            "VALUES (1, 1, 1, '{\"prenom\":\"Mariam\"}')"
        )
        duplicate_variant_count = migrated.exec_driver_sql(
            "SELECT COUNT(*) FROM cart_items WHERE cart_id = 1 AND product_id = 1"
        ).scalar_one()
    assert rows == [(1, 1, 1, 2, '{"prenom":"Awa"}')]
    assert duplicate_variant_count == 2
    engine.dispose()
