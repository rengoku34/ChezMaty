"""Lecture du catalogue, des categories et des avis publics."""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.api.dependencies import get_current_user, require_csrf
from app.db.session import get_db
from app.models import Category, Order, OrderItem, Product, Review, User
from app.schemas.catalog import (
    CategoryRead,
    ProductRead,
    ReviewCreate,
    ReviewList,
    ReviewRead,
)

router = APIRouter(tags=["Catalogue"])
MAX_PAGE_SIZE = 100


@router.get("/categories", response_model=list[CategoryRead])
def list_categories(db: Session = Depends(get_db)) -> list[Category]:
    """Lister les categories qui contiennent au moins un produit publie."""
    return list(
        db.scalars(
            select(Category)
            .join(Category.products)
            .where(Category.is_visible.is_(True), Product.is_published.is_(True))
            .distinct()
            .order_by(Category.name.asc())
        ).all()
    )


@router.get("/products", response_model=list[ProductRead])
def list_products(
    q: str | None = Query(default=None, max_length=100),
    category: str | None = Query(default=None, max_length=120),
    min_price: int | None = Query(default=None, ge=0),
    max_price: int | None = Query(default=None, ge=0),
    age: str | None = Query(default=None, max_length=80),
    color: str | None = Query(default=None, max_length=80),
    sort: str = Query(default="newest", pattern="^(newest|price_asc|price_desc)$"),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=24, ge=1, le=MAX_PAGE_SIZE),
    db: Session = Depends(get_db),
) -> list[Product]:
    """Rechercher et filtrer uniquement les produits publies."""
    if min_price is not None and max_price is not None and min_price > max_price:
        raise HTTPException(status_code=422, detail="Le prix minimum ne peut pas depasser le prix maximum.")

    statement = (
        select(Product)
        .options(joinedload(Product.images))
        .join(Category, Product.category_id == Category.id)
        .where(Product.is_published.is_(True), Category.is_visible.is_(True))
    )
    if q:
        escaped_query = q.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        statement = statement.where(
            Product.name.ilike(f"%{escaped_query}%", escape="\\")
            | Product.description.ilike(f"%{escaped_query}%", escape="\\")
        )
    if category:
        statement = statement.where(Category.slug == category)
    if min_price is not None:
        statement = statement.where(Product.price_xof >= min_price)
    if max_price is not None:
        statement = statement.where(Product.price_xof <= max_price)
    if age:
        statement = statement.where(Product.recommended_age.ilike(f"%{age.strip()}%"))
    if color:
        statement = statement.where(func.lower(Product.color) == color.strip().lower())

    if sort == "price_asc":
        statement = statement.order_by(Product.price_xof.asc(), Product.id.asc())
    elif sort == "price_desc":
        statement = statement.order_by(Product.price_xof.desc(), Product.id.asc())
    else:
        statement = statement.order_by(Product.created_at.desc(), Product.id.desc())

    return list(
        db.scalars(statement.offset(offset).limit(limit)).unique().all()
    )


@router.get("/products/{slug}", response_model=ProductRead)
def read_product(slug: str, db: Session = Depends(get_db)) -> Product:
    """Afficher la fiche d'un produit publie."""
    product = db.scalar(
        select(Product)
        .options(joinedload(Product.images))
        .join(Category, Product.category_id == Category.id)
        .where(
            Product.slug == slug,
            Product.is_published.is_(True),
            Category.is_visible.is_(True),
        )
    )
    if product is None:
        raise HTTPException(status_code=404, detail="Produit introuvable.")
    return product


@router.get("/products/{slug}/reviews", response_model=ReviewList)
def list_product_reviews(
    slug: str,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=MAX_PAGE_SIZE),
    db: Session = Depends(get_db),
) -> ReviewList:
    """Afficher exclusivement les avis approuves d'un produit publie."""
    product = db.scalar(
        select(Product.id)
        .join(Category, Product.category_id == Category.id)
        .where(
            Product.slug == slug,
            Product.is_published.is_(True),
            Category.is_visible.is_(True),
        )
    )
    if product is None:
        raise HTTPException(status_code=404, detail="Produit introuvable.")

    approved = (
        select(Review)
        .where(Review.product_id == product, Review.moderation_status == "approuve")
    )
    total = db.scalar(select(func.count()).select_from(approved.subquery())) or 0
    rows = db.scalars(
        approved.order_by(Review.created_at.desc(), Review.id.desc())
        .offset(offset)
        .limit(limit)
    ).all()
    items = [
        ReviewRead(
            id=review.id,
            product_id=review.product_id,
            rating=review.rating,
            comment=review.comment,
            created_at=review.created_at,
            customer_name="Client verifie",
        )
        for review in rows
    ]
    return ReviewList(items=items, total=total)


@router.post("/products/{slug}/reviews", response_model=ReviewRead, status_code=status.HTTP_201_CREATED)
def create_product_review(
    slug: str,
    payload: ReviewCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _: None = Depends(require_csrf),
) -> ReviewRead:
    """Enregistrer un avis d'achat en attente de moderation."""
    product = db.scalar(
        select(Product)
        .join(Category, Product.category_id == Category.id)
        .where(
            Product.slug == slug,
            Product.is_published.is_(True),
            Category.is_visible.is_(True),
        )
    )
    if product is None:
        raise HTTPException(status_code=404, detail="Produit introuvable.")

    purchased_item = db.scalar(
        select(OrderItem)
        .join(Order, Order.id == OrderItem.order_id)
        .where(
            OrderItem.id == payload.order_item_id,
            OrderItem.product_id == product.id,
            Order.user_id == user.id,
            Order.status == "livree",
        )
    )
    if purchased_item is None:
        raise HTTPException(status_code=403, detail="Un avis est reserve aux articles de commandes livrees.")
    review = Review(
        order_item_id=purchased_item.id,
        user_id=user.id,
        product_id=product.id,
        rating=payload.rating,
        comment=payload.comment,
        moderation_status="en_attente",
    )
    db.add(review)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        if db.scalar(select(Review.id).where(Review.order_item_id == purchased_item.id)) is not None:
            raise HTTPException(status_code=409, detail="Un avis existe deja pour cet achat.") from exc
        raise
    db.refresh(review)
    return ReviewRead(
        id=review.id,
        product_id=review.product_id,
        rating=review.rating,
        comment=review.comment,
        created_at=review.created_at,
        customer_name="Client verifie",
    )
