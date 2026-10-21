"""Gestion des favoris des clients connectes."""

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.api.dependencies import get_current_user, require_csrf
from app.db.session import get_db
from app.models import Category, Favorite, Product, User
from app.schemas.catalog import ProductRead

router = APIRouter(prefix="/favorites", tags=["Favoris"])


@router.get("", response_model=list[ProductRead])
def list_favorites(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[Product]:
    """Lister les produits favoris encore visibles au catalogue."""
    products = db.scalars(
        select(Product)
        .options(joinedload(Product.images))
        .join(Favorite, Favorite.product_id == Product.id)
        .join(Category, Category.id == Product.category_id)
        .where(
            Favorite.user_id == user.id,
            Product.is_published.is_(True),
            Category.is_visible.is_(True),
        )
        .order_by(Favorite.created_at.desc())
    ).unique().all()
    return list(products)


@router.put("/{product_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_csrf)])
def add_favorite(
    product_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    """Ajouter un produit publie aux favoris, sans creer de doublon."""
    product = db.scalar(
        select(Product.id)
        .join(Category, Category.id == Product.category_id)
        .where(
            Product.id == product_id,
            Product.is_published.is_(True),
            Category.is_visible.is_(True),
        )
    )
    if product is None:
        raise HTTPException(status_code=404, detail="Produit introuvable.")

    existing = db.scalar(
        select(Favorite.id).where(Favorite.user_id == user.id, Favorite.product_id == product_id)
    )
    if existing is None:
        db.add(Favorite(user_id=user.id, product_id=product_id))
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            if db.scalar(
                select(Favorite.id).where(
                    Favorite.user_id == user.id,
                    Favorite.product_id == product_id,
                )
            ) is None:
                raise
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_csrf)])
def remove_favorite(
    product_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    """Retirer un produit des favoris sans exposer les autres comptes."""
    favorite = db.scalar(
        select(Favorite).where(Favorite.user_id == user.id, Favorite.product_id == product_id)
    )
    if favorite is not None:
        db.delete(favorite)
        db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
