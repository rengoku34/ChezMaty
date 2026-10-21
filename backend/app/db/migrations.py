"""Migrations SQLAlchemy et SQL ciblees sur les changements de schema connus."""

import re

from sqlalchemy import Engine, inspect, text


def migrate_cart_item_customizations(engine: Engine) -> None:
    """Autoriser plusieurs personnalisations du meme produit dans un panier."""
    inspector = inspect(engine)
    if "cart_items" not in inspector.get_table_names():
        return

    legacy_unique = [
        constraint
        for constraint in inspector.get_unique_constraints("cart_items")
        if constraint.get("column_names") == ["cart_id", "product_id"]
    ]
    if not legacy_unique:
        return

    if engine.dialect.name == "sqlite":
        _migrate_sqlite_cart_items(engine)
        return
    if engine.dialect.name == "mysql":
        index_name = legacy_unique[0].get("name")
        if not index_name or re.fullmatch(r"[A-Za-z0-9_]+", index_name) is None:
            raise RuntimeError("L'index unique du panier n'a pas de nom exploitable pour la migration MySQL.")
        with engine.begin() as connection:
            connection.execute(
                text(f"ALTER TABLE cart_items DROP INDEX `{index_name}`")
            )
        return
    raise RuntimeError(
        f"La migration du panier n'est pas disponible pour le dialecte {engine.dialect.name}."
    )


def _migrate_sqlite_cart_items(engine: Engine) -> None:
    """Reconstruire uniquement la table SQLite des lignes de panier."""
    with engine.connect() as connection:
        connection.exec_driver_sql("PRAGMA foreign_keys=OFF")
        connection.commit()
        try:
            connection.exec_driver_sql(
                """
                CREATE TABLE cart_items_new (
                    id INTEGER NOT NULL PRIMARY KEY,
                    cart_id INTEGER NOT NULL,
                    product_id INTEGER NOT NULL,
                    quantity INTEGER NOT NULL,
                    customization TEXT,
                    CONSTRAINT ck_cart_item_quantity_positive CHECK (quantity > 0),
                    FOREIGN KEY(cart_id) REFERENCES carts (id) ON DELETE CASCADE,
                    FOREIGN KEY(product_id) REFERENCES products (id)
                )
                """
            )
            connection.exec_driver_sql(
                """
                INSERT INTO cart_items_new (id, cart_id, product_id, quantity, customization)
                SELECT id, cart_id, product_id, quantity, customization
                FROM cart_items
                """
            )
            connection.exec_driver_sql("DROP TABLE cart_items")
            connection.exec_driver_sql("ALTER TABLE cart_items_new RENAME TO cart_items")
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.exec_driver_sql("PRAGMA foreign_keys=ON")
            connection.commit()
