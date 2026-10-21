"""Initial catalogue shown by the public Chez Maty storefront."""

from sqlalchemy import func, select
from sqlalchemy.orm import sessionmaker

from app.models import Category, Product, ProductImage

CATALOG_PRODUCTS = (
    {
        "category": ("Tétines personnalisées", "tetines-personnalisees"),
        "name": "Tétine personnalisée — modèle menthe",
        "slug": "tetine-personnalisee-menthe",
        "description": "Tétine et attache personnalisées avec le prénom de bébé, modèle menthe. Prix estimatif provisoire, à confirmer sur WhatsApp avant toute commande.",
        "price_xof": 7000,
        "image": "tetine-personnalisee-menthe.jpeg",
    },
    {
        "category": ("Tétines personnalisées", "tetines-personnalisees"),
        "name": "Tétine personnalisée — modèle rose",
        "slug": "tetine-personnalisee-rose",
        "description": "Tétine et attache personnalisées avec le prénom de bébé, modèle rose. Prix estimatif provisoire, à confirmer sur WhatsApp avant toute commande.",
        "price_xof": 7000,
        "image": "tetine-personnalisee-rose.jpeg",
    },
    {
        "category": ("Coffrets de naissance", "coffrets-naissance"),
        "name": "Coffret Welcome Baby rose",
        "slug": "coffret-welcome-baby-rose",
        "description": "Coffret de naissance rose composé avec de jolies attentions pour accueillir bébé. Prix estimatif provisoire, à confirmer sur WhatsApp avant toute commande.",
        "price_xof": 55000,
        "image": "coffret-welcome-baby-rose.jpeg",
    },
    {
        "category": ("Coffrets de naissance", "coffrets-naissance"),
        "name": "Coffret de naissance Prince bleu",
        "slug": "coffret-naissance-prince-bleu",
        "description": "Coffret bleu personnalisé pour célébrer l'arrivée de bébé. Prix estimatif provisoire, à confirmer sur WhatsApp avant toute commande.",
        "price_xof": 50000,
        "image": "coffret-naissance-prince.jpeg",
    },
    {
        "category": ("Coffrets de naissance", "coffrets-naissance"),
        "name": "Coffret de naissance bleu",
        "slug": "coffret-naissance-bleu",
        "description": "Coffret de naissance bleu préparé avec des accessoires doux pour bébé. Prix estimatif provisoire, à confirmer sur WhatsApp avant toute commande.",
        "price_xof": 45000,
        "image": "coffret-naissance-bleu.jpeg",
    },
    {
        "category": ("Cadeaux personnalisés", "cadeaux-personnalises"),
        "name": "Cadeau bébé rose dans sa bulle",
        "slug": "cadeau-bebe-rose-bulle",
        "description": "Jolie tenue rose présentée dans une bulle décorative, idéale pour un cadeau de naissance. Prix estimatif provisoire, à confirmer sur WhatsApp avant toute commande.",
        "price_xof": 35000,
        "image": "cadeau-bebe-rose.jpeg",
    },
    {
        "category": ("Cadeaux personnalisés", "cadeaux-personnalises"),
        "name": "Gâteau de couches bleu",
        "slug": "gateau-couches-bleu",
        "description": "Gâteau de couches décoré dans les tons bleus, une surprise utile et originale pour bébé. Prix estimatif provisoire, à confirmer sur WhatsApp avant toute commande.",
        "price_xof": 30000,
        "image": "gateau-couches-bleu.jpeg",
    },
)


def seed_catalog(session_factory: sessionmaker) -> bool:
    """Create the starter catalogue once, without overwriting shop data."""
    with session_factory() as db:
        if db.scalar(select(func.count(Product.id))):
            return False

        categories: dict[str, Category] = {}
        for product_data in CATALOG_PRODUCTS:
            category_name, category_slug = product_data["category"]
            category = categories.get(category_slug)
            if category is None:
                category = Category(name=category_name, slug=category_slug, is_visible=True)
                categories[category_slug] = category
                db.add(category)
        db.flush()

        for product_data in CATALOG_PRODUCTS:
            category_slug = product_data["category"][1]
            product = Product(
                category_id=categories[category_slug].id,
                name=product_data["name"],
                slug=product_data["slug"],
                description=product_data["description"],
                price_xof=product_data["price_xof"],
                stock=0,
                is_published=True,
                is_featured=True,
            )
            db.add(product)
            db.flush()
            db.add(
                ProductImage(
                    product_id=product.id,
                    image_path=f"https://chezmaty.netlify.app/images/{product_data['image']}",
                    alt_text=product_data["name"],
                    position=0,
                )
            )
        db.commit()
        return True
