"""Profil, adresses, panier et commandes du client."""

import json
import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.api.dependencies import get_current_user, require_csrf
from app.db.session import get_db
from app.models import Address, Cart, CartItem, DeliveryZone, Order, OrderItem, Product, User
from app.schemas.customer import (
    AddressInput,
    AddressRead,
    CartLineInput,
    CartRead,
    CartSyncRequest,
    OrderCreateRequest,
    OrderListRead,
    OrderRead,
    ZoneRead,
)

router = APIRouter(tags=["Compte client"])


def get_or_create_cart(db: Session, user_id: int) -> Cart:
    """Charger le panier du client ou en creer un vide."""
    cart = db.scalar(select(Cart).where(Cart.user_id == user_id).options(joinedload(Cart.items)))
    if cart is None:
        cart = Cart(user_id=user_id)
        db.add(cart)
        db.commit()
        db.refresh(cart)
    return cart


def serialize_customization(raw_value: str | None) -> dict[str, str]:
    """Decoder les options de personnalisation en objet JSON."""
    if not raw_value:
        return {}
    try:
        value = json.loads(raw_value)
    except json.JSONDecodeError:
        return {}
    if not isinstance(value, dict):
        return {}
    return {str(key): str(item) for key, item in value.items() if isinstance(item, str)}


def serialize_cart(db: Session, cart: Cart) -> CartRead:
    """Calculer les lignes et le total a partir des prix courants de la base."""
    line_items: list[dict[str, object]] = []
    total_xof = 0
    for item in cart.items:
        product = db.scalar(
            select(Product)
            .options(joinedload(Product.images))
            .where(Product.id == item.product_id)
        )
        if product is None or not product.is_published:
            continue
        product_images = sorted(product.images, key=lambda image: image.position)
        line_items.append(
            {
                "id": item.id,
                "product_id": product.id,
                "slug": product.slug,
                "name": product.name,
                "price_xof": product.price_xof,
                "image_path": product_images[0].image_path if product_images else None,
                "stock": product.stock,
                "quantity": item.quantity,
                "customization": serialize_customization(item.customization),
            }
        )
        total_xof += product.price_xof * item.quantity
    return CartRead(items=line_items, total_xof=total_xof)


def validate_active_product(db: Session, product_id: int, quantity: int) -> Product:
    """Verifier qu'un produit est publie et que son stock suffit."""
    product = db.scalar(
        select(Product)
        .where(Product.id == product_id, Product.is_published.is_(True))
        .with_for_update()
    )
    if product is None:
        raise HTTPException(status_code=404, detail=f"Le produit {product_id} n'est plus disponible.")
    if product.stock < quantity:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Stock insuffisant pour « {product.name} » : {product.stock} disponible(s).",
        )
    return product


@router.get("/delivery-zones", response_model=list[ZoneRead])
def list_delivery_zones(db: Session = Depends(get_db)) -> list[DeliveryZone]:
    """Lister les communes actives en Cote d'Ivoire."""
    return list(
        db.scalars(
            select(DeliveryZone)
            .where(DeliveryZone.is_active.is_(True))
            .order_by(DeliveryZone.city.asc(), DeliveryZone.commune.asc())
        ).all()
    )


@router.get("/addresses", response_model=list[AddressRead])
def list_addresses(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[Address]:
    """Lister exclusivement les adresses appartenant au client."""
    return list(
        db.scalars(
            select(Address)
            .where(Address.user_id == user.id)
            .order_by(Address.is_default.desc(), Address.created_at.desc())
        ).all()
    )


@router.post(
    "/addresses",
    response_model=AddressRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_csrf)],
)
def create_address(
    payload: AddressInput,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Address:
    """Creer une adresse privee du compte, par defaut si c'est la premiere."""
    existing_count = db.scalar(select(func.count(Address.id)).where(Address.user_id == user.id)) or 0
    make_default = payload.is_default or existing_count == 0
    if make_default:
        db.query(Address).filter(Address.user_id == user.id).update(
            {Address.is_default: False}, synchronize_session=False
        )
    address_data = payload.model_dump(exclude={"is_default"})
    address_data["phone"] = address_data["phone"] or ""
    address = Address(user_id=user.id, **address_data, is_default=make_default)
    db.add(address)
    db.commit()
    db.refresh(address)
    return address


@router.put(
    "/addresses/{address_id}",
    response_model=AddressRead,
    dependencies=[Depends(require_csrf)],
)
def update_address(
    address_id: int,
    payload: AddressInput,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Address:
    """Modifier une adresse uniquement si elle appartient au compte."""
    address = db.scalar(select(Address).where(Address.id == address_id, Address.user_id == user.id))
    if address is None:
        raise HTTPException(status_code=404, detail="Adresse introuvable.")
    if payload.is_default:
        db.query(Address).filter(Address.user_id == user.id).update(
            {Address.is_default: False}, synchronize_session=False
        )
    for field, value in payload.model_dump().items():
        setattr(address, field, (value or "") if field == "phone" else value)
    db.commit()
    db.refresh(address)
    return address


@router.delete(
    "/addresses/{address_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_csrf)],
)
def delete_address(
    address_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    """Supprimer une adresse et choisir un remplacement si necessaire."""
    address = db.scalar(select(Address).where(Address.id == address_id, Address.user_id == user.id))
    if address is None:
        raise HTTPException(status_code=404, detail="Adresse introuvable.")
    was_default = address.is_default
    db.delete(address)
    db.flush()
    if was_default:
        replacement = db.scalar(
            select(Address)
            .where(Address.user_id == user.id)
            .order_by(Address.created_at.asc())
            .limit(1)
        )
        if replacement:
            replacement.is_default = True
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/cart", response_model=CartRead)
def read_cart(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> CartRead:
    """Retourner le panier serveur avec prix actuels."""
    return serialize_cart(db, get_or_create_cart(db, user.id))


@router.put("/cart", response_model=CartRead, dependencies=[Depends(require_csrf)])
def replace_cart(
    payload: CartSyncRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> CartRead:
    """Synchroniser le panier navigateur apres validation des stocks serveur."""
    normalized_lines: dict[tuple[int, str], tuple[CartLineInput, int]] = {}
    total_by_product: dict[int, int] = {}
    for item in payload.items:
        key = (item.product_id, json.dumps(item.customization, sort_keys=True, ensure_ascii=False))
        existing = normalized_lines.get(key)
        quantity = item.quantity + (existing[1] if existing else 0)
        if quantity > 99:
            raise HTTPException(status_code=422, detail="La quantite maximale par article est de 99.")
        normalized_lines[key] = (item, quantity)
        total_by_product[item.product_id] = total_by_product.get(item.product_id, 0) + item.quantity
        if total_by_product[item.product_id] > 99:
            raise HTTPException(status_code=422, detail="La quantite maximale par produit est de 99.")

    products: dict[int, Product] = {}
    for product_id, quantity in total_by_product.items():
        product = validate_active_product(db, product_id, quantity)
        products[product_id] = product

    cart = db.scalar(select(Cart).where(Cart.user_id == user.id).options(joinedload(Cart.items)))
    if cart is None:
        cart = Cart(user_id=user.id)
        db.add(cart)
        db.flush()
    cart.items.clear()
    for (product_id, customization_json), (_, quantity) in normalized_lines.items():
        cart.items.append(
            CartItem(
                product_id=product_id,
                quantity=quantity,
                customization=customization_json if customization_json != "{}" else None,
            )
        )
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Le panier a changé. Rechargez-le puis réessayez.") from exc
    db.refresh(cart)
    return serialize_cart(db, cart)


@router.delete(
    "/cart/items/{cart_item_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_csrf)],
)
def delete_cart_item(
    cart_item_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    """Retirer une ligne du panier propre au client."""
    item = db.scalar(
        select(CartItem)
        .join(Cart, Cart.id == CartItem.cart_id)
        .where(CartItem.id == cart_item_id, Cart.user_id == user.id)
    )
    if item is None:
        raise HTTPException(status_code=404, detail="Article de panier introuvable.")
    db.delete(item)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/orders",
    response_model=OrderRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_csrf)],
)
def create_order(
    payload: OrderCreateRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Order:
    """Creer une commande en attente apres verification de l'adresse et du stock."""
    address = db.scalar(
        select(Address).where(Address.id == payload.address_id, Address.user_id == user.id)
    )
    if address is None:
        raise HTTPException(status_code=404, detail="Adresse de livraison introuvable.")

    zone = db.scalar(
        select(DeliveryZone).where(
            func.lower(DeliveryZone.city) == address.city.lower(),
            func.lower(DeliveryZone.commune) == address.commune.lower(),
            DeliveryZone.is_active.is_(True),
        )
    )
    if zone is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Cette ville ou commune n'est pas encore desservie par Chez Maty.",
        )

    cart = db.scalar(
        select(Cart)
        .where(Cart.user_id == user.id)
        .options(joinedload(Cart.items))
        .with_for_update()
    )
    if cart is None or not cart.items:
        raise HTTPException(status_code=409, detail="Votre panier est vide.")

    verified_items: list[tuple[CartItem, Product]] = []
    total_xof = 0
    total_quantity_by_product: dict[int, int] = {}
    for cart_item in cart.items:
        total_quantity_by_product[cart_item.product_id] = (
            total_quantity_by_product.get(cart_item.product_id, 0) + cart_item.quantity
        )
    verified_products = {
        product_id: validate_active_product(db, product_id, quantity)
        for product_id, quantity in total_quantity_by_product.items()
    }
    for cart_item in cart.items:
        product = verified_products[cart_item.product_id]
        verified_items.append((cart_item, product))
        total_xof += product.price_xof * cart_item.quantity
    if total_xof <= 0:
        raise HTTPException(status_code=409, detail="Le total de la commande est invalide.")

    order = Order(
        order_number=f"CM-{datetime.now(timezone.utc):%Y%m%d}-{secrets.token_hex(4).upper()}",
        user_id=user.id,
        recipient_name=address.recipient_name,
        recipient_phone=user.phone or address.phone or "",
        delivery_city=address.city,
        delivery_commune=address.commune,
        delivery_details=address.details,
        total_xof=total_xof,
        status="en_attente",
    )
    for cart_item, product in verified_items:
        order.items.append(
            OrderItem(
                product_id=product.id,
                product_name=product.name,
                unit_price_xof=product.price_xof,
                quantity=cart_item.quantity,
                customization=cart_item.customization,
            )
        )
    db.add(order)
    cart.items.clear()
    db.flush()
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="La commande n'a pas pu etre enregistree. Reessayez.") from exc
    db.refresh(order)
    return order


@router.get("/orders", response_model=OrderListRead)
def list_orders(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> OrderListRead:
    """Lister uniquement les commandes de l'utilisateur authentifie."""
    orders = db.scalars(
        select(Order)
        .options(joinedload(Order.items))
        .where(Order.user_id == user.id)
        .order_by(Order.created_at.desc(), Order.id.desc())
    ).unique().all()
    return OrderListRead(items=orders, total=len(orders))


@router.get("/orders/{order_id}", response_model=OrderRead)
def read_order(
    order_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Order:
    """Afficher le detail et l'instantane d'une commande appartenant au client."""
    order = db.scalar(
        select(Order)
        .options(joinedload(Order.items))
        .where(Order.id == order_id, Order.user_id == user.id)
    )
    if order is None:
        raise HTTPException(status_code=404, detail="Commande introuvable.")
    return order
