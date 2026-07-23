"""Deterministic offline generator for the full 13-table catalog seed.

Produces gzip'd JSON files under `seed/catalog/` consumed by
`product_service.catalog_seeder`. Not part of the app's runtime import path —
run this once (or whenever the seed data needs regenerating), not at service
startup:

    uv run --package product-service python services/product_service/scripts/generate_seed_data.py

Every random choice is drawn from a single `random.Random(SEED)` instance,
consumed in a fixed call order, so re-running this script reproduces
byte-identical output (gzip is written with `mtime=0`).
"""

import gzip
import itertools
import json
import random
import re
import sys
import time
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path

from product_service.repo import slugify
from product_service.seeder import _deterministic_uniq_id

SEED = 42
OUTPUT_DIR = Path(__file__).resolve().parents[1] / "seed" / "catalog"

MANUFACTURER_COUNT = 18
BRAND_COUNT = 100
PRODUCT_COUNT = 10_500
VARIANT_PRODUCT_TARGET = 2_500

COUNTRY_CODES = ["US", "CN", "IN", "DE", "JP", "KR", "GB", "FR", "IT", "VN", "BD", "TH", "MX", "BR", "TR", "ID", "PH", "CA", "ES", "NL"]

ADJECTIVES = [
    "Premium", "Deluxe", "Classic", "Modern", "Compact", "Portable", "Professional", "Essential",
    "Advanced", "Ultra", "Everyday", "Signature", "Smart", "Eco-Friendly", "Rugged", "Sleek",
    "Heavy-Duty", "Lightweight", "Versatile", "Refined",
]

MANUFACTURER_NAME_POOL = [
    "Meridian Industries", "Cascade Manufacturing", "Ironclad Works", "Silverline Corp", "BluePeak Manufacturing",
    "Coastal Industries", "Highland Foundry", "Vantage Manufacturing", "Redwood Industries", "Sterling Works",
    "Apex Manufacturing", "Northgate Industries", "Falcon Manufacturing", "Granite Works", "Beacon Industries",
    "Cobalt Manufacturing", "Anchor Industries", "Summit Manufacturing", "Pinehurst Industries", "Keystone Manufacturing",
    "Lighthouse Industries", "Vanguard Manufacturing", "Horizon Industries", "Bedrock Manufacturing",
    "Meadowbrook Industries", "Crestwood Manufacturing", "Ridgeline Industries", "Fairview Manufacturing",
    "Westbrook Industries", "Clearwater Manufacturing",
]

BRAND_PREFIXES = [
    "Nova", "Zenith", "Aero", "Terra", "Lumo", "Vertex", "Crest", "Orbit", "Pulse", "Drift",
    "Solace", "Nimbus", "Cobalt", "Ember", "Quartz", "Halcyon", "Onyx", "Ridge", "Summit", "Wren",
    "Fenix", "Aster", "Brisk", "Cascade", "Dune", "Echo", "Flint", "Grove", "Haven", "Ivory",
    "Juno", "Kestrel", "Lark", "Marble", "Northline", "Opal", "Pinnacle", "Quill", "Raven", "Sable",
    "Thistle", "Umber", "Violet", "Willow", "Xenon", "Yarrow", "Zephyr", "Cedar", "Amber", "Basalt",
]
BRAND_SUFFIXES = [
    "Labs", "Co", "Works", "Studio", "Collective", "House", "Goods", "Craft", "Supply", "Forge",
    "Group", "Industries", "Depot", "Mercantile", "Traders", "Wear", "Living", "Essentials", "Gear", "Outfitters",
]

TAG_NAMES = [
    "Best Seller", "New Arrival", "Eco Friendly", "Premium", "Budget Pick", "Limited Edition", "Trending",
    "Editor's Choice", "Handmade", "Waterproof", "Wireless", "Organic", "Vegan", "Sale", "Clearance",
    "Gift Idea", "Top Rated", "Exclusive", "Durable", "Lightweight", "Portable", "Rechargeable",
    "Energy Efficient", "Premium Quality", "Value Pack", "Family Pack", "Travel Friendly", "Quick Delivery",
    "Made Locally", "Imported", "Certified", "Award Winning", "Customer Favorite", "Back in Stock",
    "Pre-Order", "Flash Deal", "Bundle Offer", "Refurbished", "Open Box", "Warranty Included",
    "Free Shipping", "Compact", "Foldable", "Adjustable", "Multi-Purpose", "All Season", "Anti-Bacterial",
    "Skin Friendly", "Kid Safe", "Pet Friendly", "Non-Toxic",
]

COLLECTION_NAMES = [
    "Summer Essentials", "Back to School", "Festive Specials", "New Arrivals", "Best Sellers",
    "Under $25", "Premium Picks", "Eco-Friendly Choices", "Work From Home", "Fitness Favorites",
    "Home Makeover", "Tech Deals", "Kids Corner", "Pet Lovers", "Travel Ready", "Gift Guide",
    "Winter Warmers", "Monsoon Must-Haves", "Wedding Season", "Festive Sale", "Weekend Deals",
    "Clearance Sale", "Trending Now", "Editor's Picks", "Staff Favorites", "Budget Friendly",
    "Luxury Collection", "Outdoor Adventure", "Kitchen Essentials", "Everyday Basics",
]

# (name, code, is_variant_defining, values)
ATTRIBUTE_DEFS: list[tuple[str, str, bool, list[str]]] = [
    ("Color", "color", True, ["Black", "White", "Blue", "Red", "Green", "Grey", "Silver", "Gold", "Pink", "Purple"]),
    ("Size", "size", True, ["XS", "S", "M", "L", "XL", "XXL"]),
    ("Storage Capacity", "storage_capacity", True, ["16GB", "32GB", "64GB", "128GB", "256GB", "512GB", "1TB"]),
    ("RAM", "ram", False, ["2GB", "4GB", "6GB", "8GB", "12GB", "16GB"]),
    ("Material", "material", True, ["Cotton", "Polyester", "Leather", "Metal", "Plastic", "Wood", "Glass", "Ceramic"]),
    ("Connector Type", "connector_type", False, ["USB-C", "USB-A", "Lightning", "Micro-USB", "HDMI", "Bluetooth"]),
    ("Style", "style", False, ["Casual", "Formal", "Sporty", "Vintage", "Modern"]),
    ("Weight Class", "weight_class", False, ["Light", "Medium", "Heavy"]),
    ("Pattern", "pattern", False, ["Solid", "Striped", "Checked", "Floral", "Printed"]),
    ("Battery Life", "battery_life", False, ["Up to 6 hrs", "Up to 12 hrs", "Up to 24 hrs", "Up to 48 hrs"]),
    ("Screen Size", "screen_size", False, ["5 inch", "6 inch", "6.5 inch", "15 inch", "17 inch"]),
    ("Power Source", "power_source", False, ["Battery", "USB", "Solar", "Manual"]),
    ("Flavor", "flavor", False, ["Original", "Spicy", "Sweet", "Mint", "Chocolate", "Vanilla", "Berry"]),
    ("Fit Type", "fit_type", True, ["Slim Fit", "Regular Fit", "Loose Fit", "Athletic Fit"]),
    ("Finish", "finish", False, ["Matte", "Glossy", "Textured", "Metallic"]),
    ("Closure Type", "closure_type", False, ["Zipper", "Buttons", "Velcro", "Lace-up", "Slip-on"]),
    ("Age Group", "age_group", False, ["Infant", "Toddler", "Kids", "Teen", "Adult"]),
    ("Package Quantity", "package_quantity", True, ["Pack of 1", "Pack of 2", "Pack of 3", "Pack of 5", "Pack of 10"]),
    ("Compatibility", "compatibility", False, ["Universal", "Android", "iOS", "Windows", "Mac"]),
    ("Certification", "certification", False, ["ISO 9001", "CE", "RoHS", "FCC", "Energy Star"]),
]
VARIANT_DEFINING_CODES = {code for _, code, is_vd, _ in ATTRIBUTE_DEFS if is_vd}

# name -> {None: leaf} | {sub_name: None | [grandchild names]}
CATEGORY_TREE: dict[str, dict[str, list[str] | None]] = {
    "Electronics": {
        "Mobiles": ["Smartphones", "Feature Phones"],
        "Laptops": ["Ultrabooks", "Gaming Laptops"],
        "Cameras": None,
        "Audio": None,
        "Wearables": None,
        "Televisions": None,
        "Accessories": None,
    },
    "Fashion": {
        "Men's Clothing": ["Shirts", "T-Shirts", "Trousers"],
        "Women's Clothing": ["Dresses", "Tops", "Trousers"],
        "Kids' Clothing": None,
        "Footwear": None,
        "Watches": None,
        "Jewelry": None,
        "Bags": None,
    },
    "Home & Kitchen": {
        "Furniture": None,
        "Kitchen Appliances": ["Small Appliances", "Large Appliances"],
        "Cookware": None,
        "Home Decor": None,
        "Bedding": None,
        "Storage": None,
    },
    "Sports & Outdoors": {
        "Fitness Equipment": None,
        "Cycling": None,
        "Camping & Hiking": None,
        "Team Sports": None,
        "Yoga": None,
    },
    "Beauty & Personal Care": {
        "Skincare": None,
        "Haircare": None,
        "Makeup": None,
        "Fragrances": None,
        "Personal Care Tools": None,
    },
    "Toys & Games": {
        "Action Figures": None,
        "Board Games": None,
        "Educational Toys": None,
        "Outdoor Play": None,
        "Puzzles": None,
    },
    "Books": {
        "Fiction": None,
        "Non-Fiction": None,
        "Children's Books": None,
        "Academic": None,
        "Comics": None,
    },
    "Automotive": {
        "Car Accessories": None,
        "Motorcycle Parts": None,
        "Car Electronics": None,
        "Tools & Equipment": None,
    },
    "Grocery & Gourmet": {
        "Snacks": None,
        "Beverages": None,
        "Pantry Staples": None,
        "Organic Foods": None,
    },
    "Health & Household": {
        "Vitamins & Supplements": None,
        "Medical Supplies": None,
        "Cleaning Supplies": None,
    },
    "Office Products": {
        "Stationery": None,
        "Office Furniture": None,
        "Office Electronics": None,
    },
    "Pet Supplies": {
        "Dog Supplies": None,
        "Cat Supplies": None,
        "Fish & Aquatic": None,
        "Bird Supplies": None,
    },
}

TOP_CATEGORY_META: dict[str, dict] = {
    "Electronics": {
        "price_range": (799, 149_999),
        "attr_codes": [
            "color", "storage_capacity", "ram", "connector_type", "battery_life", "screen_size", "compatibility", "certification",
        ],
        "spec_pool": [
            "128GB Storage", "256GB Storage", "8GB RAM", "Wi-Fi 6 Ready", "Bluetooth 5.2",
            "Fast Charging", "4K Display", "OLED Display", "Voice Assistant Support", "IP68 Water Resistant",
        ],
    },
    "Fashion": {
        "price_range": (299, 12_999),
        "attr_codes": ["color", "size", "material", "style", "pattern", "fit_type", "closure_type"],
        "spec_pool": [
            "Slim Fit", "Breathable Fabric", "Machine Washable", "All-Season Wear", "Wrinkle Resistant",
            "Stretch Fit", "Quick Dry", "Reinforced Stitching", "Adjustable Fit", "Soft Touch Finish",
        ],
    },
    "Home & Kitchen": {
        "price_range": (199, 49_999),
        "attr_codes": ["color", "material", "weight_class", "finish", "package_quantity", "power_source"],
        "spec_pool": [
            "Dishwasher Safe", "Non-Stick Coating", "Space Saving Design", "Easy Assembly", "Scratch Resistant",
            "Energy Efficient", "Stackable Design", "Odor Resistant", "Rust Proof", "Anti-Slip Base",
        ],
    },
    "Sports & Outdoors": {
        "price_range": (299, 29_999),
        "attr_codes": ["color", "material", "size", "weight_class", "style"],
        "spec_pool": [
            "Sweat Resistant", "Shock Absorbing", "Quick-Dry Fabric", "Adjustable Straps", "All-Terrain Grip",
            "Impact Resistant", "Breathable Mesh", "Foldable Design", "Non-Slip Grip", "Reinforced Seams",
        ],
    },
    "Beauty & Personal Care": {
        "price_range": (99, 4_999),
        "attr_codes": ["flavor", "package_quantity", "age_group", "certification", "finish"],
        "spec_pool": [
            "Dermatologist Tested", "Cruelty Free", "Paraben Free", "Long Lasting Formula", "Suitable for All Skin Types",
            "Fast Absorbing", "Non-Greasy Formula", "SPF Protection", "Hypoallergenic", "Travel Friendly Size",
        ],
    },
    "Toys & Games": {
        "price_range": (149, 7_999),
        "attr_codes": ["color", "age_group", "material", "package_quantity", "certification"],
        "spec_pool": [
            "Non-Toxic Materials", "Educational Design", "Battery Operated", "Ages 3 and Up", "Encourages Creativity",
            "Easy to Clean", "Durable Build", "Interactive Play", "Safe Rounded Edges", "Multiplayer Fun",
        ],
    },
    "Books": {
        "price_range": (99, 2_999),
        "attr_codes": ["age_group", "package_quantity"],
        "spec_pool": [
            "Bestselling Title", "Award-Winning Author", "Illustrated Edition", "Paperback Edition",
            "Hardcover Edition", "Includes Study Guide", "Large Print Edition", "Collector's Edition",
        ],
    },
    "Automotive": {
        "price_range": (199, 39_999),
        "attr_codes": ["color", "material", "compatibility", "certification", "power_source"],
        "spec_pool": [
            "Universal Fit", "Weatherproof Build", "Easy Installation", "Corrosion Resistant", "OEM Quality",
            "Heavy-Duty Construction", "LED Illumination", "Shock Absorbing", "Anti-Theft Design", "Plug and Play",
        ],
    },
    "Grocery & Gourmet": {
        "price_range": (49, 2_999),
        "attr_codes": ["flavor", "package_quantity", "certification"],
        "spec_pool": [
            "No Artificial Preservatives", "Rich in Nutrients", "Resealable Pack", "Farm Fresh",
            "Small Batch Roasted", "Naturally Sourced", "Low Sugar Recipe", "Gluten Free Option",
        ],
    },
    "Health & Household": {
        "price_range": (99, 4_999),
        "attr_codes": ["package_quantity", "certification", "age_group"],
        "spec_pool": [
            "Doctor Recommended", "Non-Drowsy Formula", "Fragrance Free", "Easy Dosage",
            "Fast Acting Relief", "Family Pack", "Lab Tested", "Allergy Friendly",
        ],
    },
    "Office Products": {
        "price_range": (49, 14_999),
        "attr_codes": ["color", "material", "package_quantity", "compatibility"],
        "spec_pool": [
            "Ergonomic Design", "Space Saving", "Refillable Cartridge", "Smudge Free Ink",
            "Adjustable Height", "Cable Management Built-In", "Noise Reducing", "Multi-Device Compatible",
        ],
    },
    "Pet Supplies": {
        "price_range": (99, 5_999),
        "attr_codes": ["color", "material", "size", "package_quantity", "flavor"],
        "spec_pool": [
            "Vet Approved", "Grain Free Recipe", "Chew Resistant", "Machine Washable Cover",
            "Non-Toxic Materials", "All Breed Sizes", "Odor Control Formula", "Durable Stitching",
        ],
    },
}

TITLE_PATTERNS = [
    "{brand} {adjective} {leaf}",
    "{brand} {leaf} - {spec}",
    "{brand} {adjective} {leaf} ({spec})",
    "{adjective} {leaf} by {brand}",
    "{brand} {leaf} {material} Edition",
    "{brand} {leaf}",
]

DESCRIPTION_TEMPLATES = [
    "{title} combines {adjective_lower} design with dependable everyday performance.",
    "Crafted for people who expect more, this {leaf_lower} from {brand} delivers {spec_lower} in a package built to last.",
    "This {adjective_lower} {leaf_lower} from {brand} is a customer favorite, featuring {spec_lower} and thoughtful details throughout.",
    "Discover the {brand} {leaf_lower} — {spec_lower}, {adjective_lower}, and ready for daily use.",
]

_SLUG_RE = re.compile(r"^[a-z0-9_]+$")


def _q2(value: float) -> Decimal:
    return Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _dedup_label(base: str, used: dict[str, int], *, sep: str) -> str:
    if base not in used:
        used[base] = 1
        return base
    used[base] += 1
    return f"{base}{sep}{used[base]}"


def _rand_phone(rng: random.Random) -> str:
    return f"+1-555-{rng.randint(1000, 9999)}"


# ---------------------------------------------------------------------------
# Manufacturers / brands
# ---------------------------------------------------------------------------


def generate_manufacturers(rng: random.Random, count: int) -> list[dict]:
    used: set[str] = set()
    rows = []
    for manufacturer_id in range(1, count + 1):
        name = rng.choice(MANUFACTURER_NAME_POOL)
        while name in used:
            name = rng.choice(MANUFACTURER_NAME_POOL)
        used.add(name)
        rows.append(
            {
                "id": manufacturer_id,
                "name": name,
                "country_of_origin": rng.choice(COUNTRY_CODES),
                "contact_info": {"email": f"contact@{slugify(name)}.example.com", "phone": _rand_phone(rng)},
            }
        )
    return rows


def generate_brands(rng: random.Random, count: int, manufacturer_ids: list[int]) -> list[dict]:
    used_names: set[str] = set()
    used_slugs: dict[str, int] = {}
    rows = []
    for brand_id in range(1, count + 1):
        name = f"{rng.choice(BRAND_PREFIXES)} {rng.choice(BRAND_SUFFIXES)}"
        while name in used_names:
            name = f"{rng.choice(BRAND_PREFIXES)} {rng.choice(BRAND_SUFFIXES)}"
        used_names.add(name)
        slug = _dedup_label(slugify(name), used_slugs, sep="-")
        manufacturer_id = rng.choice(manufacturer_ids) if rng.random() < 0.85 else None
        rows.append(
            {
                "id": brand_id,
                "name": name,
                "slug": slug,
                "logo_url": f"https://cdn.ecom-seed.example.com/brands/{slug}.png",
                "manufacturer_id": manufacturer_id,
                "description": f"{name} creates {rng.choice(ADJECTIVES).lower()} products trusted by shoppers worldwide.",
                "is_active": rng.random() < 0.95,
            }
        )
    return rows


# ---------------------------------------------------------------------------
# Categories
# ---------------------------------------------------------------------------


def generate_categories(tree: dict) -> tuple[list[dict], list[dict]]:
    rows: list[dict] = []
    leaves: list[dict] = []
    used_slugs: dict[str, int] = {}
    next_id = itertools.count(1)

    def add_node(name: str, parent_id: int | None, parent_path: str | None, depth: int, sort_order: int) -> tuple[int, str]:
        label = _dedup_label(slugify(name, sep="_"), used_slugs, sep="_")
        path = label if parent_path is None else f"{parent_path}.{label}"
        node_id = next(next_id)
        rows.append(
            {
                "id": node_id,
                "parent_id": parent_id,
                "name": name,
                "slug": label,
                "path": path,
                "depth": depth,
                "is_active": True,
                "sort_order": sort_order,
            }
        )
        return node_id, path

    for top_sort, (top_name, subtree) in enumerate(tree.items()):
        top_id, top_path = add_node(top_name, None, None, 0, top_sort)
        for sub_sort, (sub_name, children) in enumerate(subtree.items()):
            sub_id, sub_path = add_node(sub_name, top_id, top_path, 1, sub_sort)
            if not children:
                leaves.append({"id": sub_id, "name": sub_name, "top_name": top_name})
                continue
            for child_sort, child_name in enumerate(children):
                child_id, _ = add_node(child_name, sub_id, sub_path, 2, child_sort)
                leaves.append({"id": child_id, "name": child_name, "top_name": top_name})

    return rows, leaves


# ---------------------------------------------------------------------------
# Tags / collections
# ---------------------------------------------------------------------------


def generate_tags(names: list[str]) -> list[dict]:
    used_slugs: dict[str, int] = {}
    return [
        {"id": tag_id, "name": name, "slug": _dedup_label(slugify(name), used_slugs, sep="-")}
        for tag_id, name in enumerate(names, start=1)
    ]


def generate_collections(names: list[str]) -> list[dict]:
    used_slugs: dict[str, int] = {}
    rows = []
    for collection_id, name in enumerate(names, start=1):
        rows.append(
            {
                "id": collection_id,
                "name": name,
                "slug": _dedup_label(slugify(name), used_slugs, sep="-"),
                "description": f"Handpicked {name.lower()} picks curated for you.",
                "is_active": True,
                "starts_at": None,
                "ends_at": None,
            }
        )
    return rows


# ---------------------------------------------------------------------------
# Attributes / attribute values
# ---------------------------------------------------------------------------


def generate_attributes_and_values(
    defs: list[tuple[str, str, bool, list[str]]],
) -> tuple[list[dict], list[dict], dict[str, list[str]], dict[tuple[str, str], int]]:
    attribute_rows: list[dict] = []
    value_rows: list[dict] = []
    values_by_code: dict[str, list[str]] = {}
    value_id_lookup: dict[tuple[str, str], int] = {}

    next_value_id = itertools.count(1)
    for attribute_id, (name, code, is_variant_defining, values) in enumerate(defs, start=1):
        attribute_rows.append(
            {"id": attribute_id, "name": name, "code": code, "is_variant_defining": is_variant_defining, "sort_order": attribute_id - 1}
        )
        values_by_code[code] = values
        for sort_order, value in enumerate(values):
            value_id = next(next_value_id)
            value_rows.append(
                {"id": value_id, "attribute_id": attribute_id, "value": value, "slug": slugify(value), "sort_order": sort_order}
            )
            value_id_lookup[(code, value)] = value_id

    return attribute_rows, value_rows, values_by_code, value_id_lookup


# ---------------------------------------------------------------------------
# Products
# ---------------------------------------------------------------------------


def _build_title(rng: random.Random, *, brand: str, adjective: str, leaf: str, spec: str, material: str) -> str:
    pattern = rng.choice(TITLE_PATTERNS)
    return pattern.format(brand=brand, adjective=adjective, leaf=leaf, spec=spec, material=material)


def _build_description(rng: random.Random, *, title: str, brand: str, leaf: str, spec: str, adjective: str) -> str:
    template = rng.choice(DESCRIPTION_TEMPLATES)
    return template.format(title=title, brand=brand, leaf_lower=leaf.lower(), spec_lower=spec.lower(), adjective_lower=adjective.lower())


def _build_attributes(rng: random.Random, attr_codes: list[str], values_by_code: dict[str, list[str]]) -> dict:
    codes = attr_codes[:]
    rng.shuffle(codes)
    chosen = codes[: rng.randint(2, min(4, len(codes)))]
    return {code: rng.choice(values_by_code[code]) for code in chosen}


def _rand_review_count(rng: random.Random) -> int:
    bucket = rng.choices(["none", "low", "mid", "high"], weights=[15, 45, 30, 10])[0]
    return {"none": 0, "low": rng.randint(1, 50), "mid": rng.randint(51, 500), "high": rng.randint(501, 5000)}[bucket]


def generate_products(
    rng: random.Random,
    *,
    count: int,
    brands: list[dict],
    leaves: list[dict],
    top_meta: dict[str, dict],
    values_by_code: dict[str, list[str]],
) -> list[dict]:
    status_minority = ["DRAFT", "PENDING_APPROVAL", "ARCHIVED"]
    material_words = values_by_code["material"]
    rows = []
    for product_id in range(1, count + 1):
        leaf = rng.choice(leaves)
        meta = top_meta[leaf["top_name"]]
        brand = rng.choice(brands)
        adjective = rng.choice(ADJECTIVES)
        spec = rng.choice(meta["spec_pool"])
        material = rng.choice(material_words)

        title = _build_title(rng, brand=brand["name"], adjective=adjective, leaf=leaf["name"], spec=spec, material=material)
        description = _build_description(rng, title=title, brand=brand["name"], leaf=leaf["name"], spec=spec, adjective=adjective)

        price = _q2(rng.uniform(*meta["price_range"]))
        discount = _q2(0) if rng.random() < 0.55 else min(_q2(float(price) * rng.uniform(0.05, 0.3)), price)
        rating = _q2(rng.uniform(2.5, 5.0))
        review_count = _rand_review_count(rng)
        status = "PUBLISHED" if rng.random() < 0.9 else rng.choice(status_minority)

        uniq_id = _deterministic_uniq_id(title, leaf["top_name"], str(price))
        slug = f"{slugify(title)}-{product_id}"
        image_url = f"https://cdn.ecom-seed.example.com/products/{product_id}/1.jpg"

        rows.append(
            {
                "id": product_id,
                "uniq_id": uniq_id,
                "title": title,
                "slug": slug,
                "product_url": image_url,
                "retail_price": str(price),
                "discount": str(discount),
                "image_urls": image_url,
                "description": description,
                "category": leaf["top_name"],
                "sub_category": leaf["name"],
                "brand": brand["name"],
                "rating": str(rating),
                "review_count": review_count,
                "seller_id": None,
                "brand_id": brand["id"],
                "manufacturer_id": brand["manufacturer_id"],
                "category_id": leaf["id"],
                "status": status,
                "seo_title": title[:255],
                "seo_description": description[:500],
                "canonical_url": f"https://shop.example.com/p/{slug}",
                "meta_keywords": [leaf["top_name"].lower(), leaf["name"].lower(), brand["name"].lower()],
                "attributes": _build_attributes(rng, meta["attr_codes"], values_by_code),
                "created_by": None,
                "updated_by": None,
                "is_deleted": False,
                "deleted_at": None,
                "deleted_by": None,
                "version": 1,
            }
        )
    return rows


# ---------------------------------------------------------------------------
# Variants / variant attribute values
# ---------------------------------------------------------------------------


def generate_variants(
    rng: random.Random,
    *,
    products: list[dict],
    top_meta: dict[str, dict],
    values_by_code: dict[str, list[str]],
    value_id_lookup: dict[tuple[str, str], int],
    target_count: int,
) -> tuple[list[dict], list[dict]]:
    candidate_indices = rng.sample(range(len(products)), k=min(target_count, len(products)))
    variant_rows: list[dict] = []
    link_rows: list[dict] = []
    next_variant_id = itertools.count(1)
    barcode = 8_900_000_000_000

    for idx in candidate_indices:
        product = products[idx]
        meta = top_meta[product["category"]]
        variant_codes = [code for code in meta["attr_codes"] if code in VARIANT_DEFINING_CODES]
        if not variant_codes:
            continue

        chosen_codes = variant_codes[: rng.randint(1, min(2, len(variant_codes)))]
        combos = list(itertools.product(*[values_by_code[code] for code in chosen_codes]))
        rng.shuffle(combos)
        combos = combos[: rng.randint(1, 4)]

        for variant_index, combo in enumerate(combos):
            variant_attrs = dict(zip(chosen_codes, combo, strict=True))
            variant_id = next(next_variant_id)
            variant_rows.append(
                {
                    "id": variant_id,
                    "product_id": product["id"],
                    "variant_name": " / ".join(combo),
                    "barcode": str(barcode),
                    "upc": str(barcode + 1),
                    "ean": str(barcode + 2),
                    "hsn_code": str(rng.randint(1000, 9999)),
                    "gst_category": rng.choice(["5%", "12%", "18%", "28%"]),
                    "country_of_origin": rng.choice(COUNTRY_CODES),
                    "weight_grams": rng.randint(50, 5000),
                    "length_mm": rng.randint(20, 1000),
                    "width_mm": rng.randint(20, 1000),
                    "height_mm": rng.randint(10, 500),
                    "fragile": rng.random() < 0.15,
                    "shipping_class": rng.choice(["STANDARD", "FRAGILE", "OVERSIZE", "LIQUID"]),
                    "manufacturer_warranty_months": rng.choice([0, 6, 12, 24, 36]),
                    "serial_number_required": rng.random() < 0.2,
                    "expiry_tracked": rng.random() < 0.1,
                    "attributes": variant_attrs,
                    "is_default": variant_index == 0,
                    "status": "ACTIVE" if rng.random() < 0.92 else rng.choice(["INACTIVE", "DISCONTINUED"]),
                }
            )
            for code in chosen_codes:
                link_rows.append(
                    {"variant_id": variant_id, "attribute_value_id": value_id_lookup[(code, variant_attrs[code])]}
                )
            barcode += 3

    return variant_rows, link_rows


# ---------------------------------------------------------------------------
# Images
# ---------------------------------------------------------------------------


def generate_images(rng: random.Random, *, products: list[dict], variants: list[dict]) -> list[dict]:
    rows: list[dict] = []
    next_id = itertools.count(1)

    for product in products:
        image_count = rng.randint(1, 3)
        for position in range(image_count):
            rows.append(
                {
                    "id": next(next_id),
                    "product_id": product["id"],
                    "variant_id": None,
                    "kind": "PRIMARY" if position == 0 else "GALLERY",
                    "url": f"https://cdn.ecom-seed.example.com/products/{product['id']}/{position + 1}.jpg",
                    "video_url": None,
                    "alt_text": product["title"][:255],
                    "sort_order": position,
                }
            )

    for variant in variants:
        if rng.random() < 0.5:
            rows.append(
                {
                    "id": next(next_id),
                    "product_id": variant["product_id"],
                    "variant_id": variant["id"],
                    "kind": "GALLERY",
                    "url": f"https://cdn.ecom-seed.example.com/variants/{variant['id']}/1.jpg",
                    "video_url": None,
                    "alt_text": variant["variant_name"][:255],
                    "sort_order": 0,
                }
            )

    return rows


# ---------------------------------------------------------------------------
# Association tables
# ---------------------------------------------------------------------------


def generate_collection_products(rng: random.Random, *, collections: list[dict], products: list[dict]) -> list[dict]:
    published = [product for product in products if product["status"] == "PUBLISHED"]
    rows = []
    for collection in collections:
        k = min(rng.randint(5, 15), len(published))
        for sort_order, product in enumerate(rng.sample(published, k)):
            rows.append({"collection_id": collection["id"], "product_id": product["id"], "sort_order": sort_order})
    return rows


def generate_product_tags(rng: random.Random, *, products: list[dict], tags: list[dict]) -> list[dict]:
    tag_ids = [tag["id"] for tag in tags]
    rows = []
    for product in products:
        n = rng.choices([0, 1, 2, 3, 4], weights=[10, 30, 30, 20, 10])[0]
        if n == 0:
            continue
        for tag_id in rng.sample(tag_ids, min(n, len(tag_ids))):
            rows.append({"product_id": product["id"], "tag_id": tag_id})
    return rows


# ---------------------------------------------------------------------------
# Self-validation
# ---------------------------------------------------------------------------


def _assert_uniform_keys(table: str, rows: list[dict]) -> None:
    if not rows:
        return
    expected = set(rows[0])
    for index, row in enumerate(rows):
        if set(row) != expected:
            raise ValueError(f"{table}: row {index} key set {sorted(row)} != {sorted(expected)}")


def _assert_unique(table: str, rows: list[dict], field: str, *, allow_null: bool = False) -> None:
    seen: set = set()
    for row in rows:
        value = row[field]
        if value is None:
            if allow_null:
                continue
            raise ValueError(f"{table}.{field} is null")
        if value in seen:
            raise ValueError(f"{table}.{field} duplicate value: {value!r}")
        seen.add(value)


def _assert_unique_tuple(table: str, rows: list[dict], fields: tuple[str, ...]) -> None:
    seen: set = set()
    for row in rows:
        key = tuple(row[field] for field in fields)
        if key in seen:
            raise ValueError(f"{table} duplicate {fields}: {key}")
        seen.add(key)


def _assert_fk(table: str, rows: list[dict], field: str, valid_ids: set, *, nullable: bool = False) -> None:
    for row in rows:
        value = row[field]
        if value is None:
            if nullable:
                continue
            raise ValueError(f"{table}.{field} is null but FK is NOT NULL")
        if value not in valid_ids:
            raise ValueError(f"{table}.{field}={value} has no matching parent row")


def _assert_category_ltree_safe(rows: list[dict]) -> None:
    for row in rows:
        if not _SLUG_RE.match(row["slug"]):
            raise ValueError(f"categories.slug not ltree-safe: {row['slug']!r}")
        for segment in row["path"].split("."):
            if not _SLUG_RE.match(segment):
                raise ValueError(f"categories.path segment not ltree-safe: {segment!r} in {row['path']!r}")


def validate_all(data: dict[str, list[dict]]) -> None:
    for table, rows in data.items():
        _assert_uniform_keys(table, rows)

    _assert_unique("manufacturers", data["manufacturers"], "name")

    brand_ids = {row["id"] for row in data["brands"]}
    manufacturer_ids = {row["id"] for row in data["manufacturers"]}
    _assert_unique("brands", data["brands"], "name")
    _assert_unique("brands", data["brands"], "slug")
    _assert_fk("brands", data["brands"], "manufacturer_id", manufacturer_ids, nullable=True)

    category_ids = {row["id"] for row in data["categories"]}
    _assert_unique("categories", data["categories"], "slug")
    _assert_unique_tuple("categories", data["categories"], ("parent_id", "name"))
    _assert_fk("categories", data["categories"], "parent_id", category_ids, nullable=True)
    _assert_category_ltree_safe(data["categories"])

    tag_ids = {row["id"] for row in data["tags"]}
    _assert_unique("tags", data["tags"], "name")
    _assert_unique("tags", data["tags"], "slug")

    attribute_ids = {row["id"] for row in data["product_attributes"]}
    _assert_unique("product_attributes", data["product_attributes"], "name")
    _assert_unique("product_attributes", data["product_attributes"], "code")

    attribute_value_ids = {row["id"] for row in data["attribute_values"]}
    _assert_unique_tuple("attribute_values", data["attribute_values"], ("attribute_id", "value"))
    _assert_fk("attribute_values", data["attribute_values"], "attribute_id", attribute_ids)

    collection_ids = {row["id"] for row in data["collections"]}
    _assert_unique("collections", data["collections"], "slug")

    product_ids = {row["id"] for row in data["products"]}
    _assert_unique("products", data["products"], "uniq_id")
    _assert_unique("products", data["products"], "slug")
    _assert_fk("products", data["products"], "brand_id", brand_ids, nullable=True)
    _assert_fk("products", data["products"], "manufacturer_id", manufacturer_ids, nullable=True)
    _assert_fk("products", data["products"], "category_id", category_ids, nullable=True)

    _assert_unique_tuple("collection_products", data["collection_products"], ("collection_id", "product_id"))
    _assert_fk("collection_products", data["collection_products"], "collection_id", collection_ids)
    _assert_fk("collection_products", data["collection_products"], "product_id", product_ids)

    _assert_unique_tuple("product_tags", data["product_tags"], ("product_id", "tag_id"))
    _assert_fk("product_tags", data["product_tags"], "product_id", product_ids)
    _assert_fk("product_tags", data["product_tags"], "tag_id", tag_ids)

    variant_ids = {row["id"] for row in data["product_variants"]}
    _assert_unique("product_variants", data["product_variants"], "barcode", allow_null=True)
    _assert_unique("product_variants", data["product_variants"], "upc", allow_null=True)
    _assert_unique("product_variants", data["product_variants"], "ean", allow_null=True)
    _assert_fk("product_variants", data["product_variants"], "product_id", product_ids)

    _assert_unique_tuple(
        "product_variant_attribute_values", data["product_variant_attribute_values"], ("variant_id", "attribute_value_id")
    )
    _assert_fk("product_variant_attribute_values", data["product_variant_attribute_values"], "variant_id", variant_ids)
    _assert_fk(
        "product_variant_attribute_values", data["product_variant_attribute_values"], "attribute_value_id", attribute_value_ids
    )

    _assert_fk("product_images", data["product_images"], "product_id", product_ids)
    _assert_fk("product_images", data["product_images"], "variant_id", variant_ids, nullable=True)
    primary_seen: set = set()
    for row in data["product_images"]:
        if row["kind"] != "PRIMARY":
            continue
        key = (row["product_id"], row["variant_id"])
        if key in primary_seen:
            raise ValueError(f"product_images duplicate PRIMARY for (product_id, variant_id)={key}")
        primary_seen.add(key)


# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------

FILES = {
    "manufacturers": "manufacturers.json.gz",
    "brands": "brands.json.gz",
    "categories": "categories.json.gz",
    "tags": "tags.json.gz",
    "product_attributes": "product_attributes.json.gz",
    "attribute_values": "attribute_values.json.gz",
    "collections": "collections.json.gz",
    "products": "products.json.gz",
    "collection_products": "collection_products.json.gz",
    "product_tags": "product_tags.json.gz",
    "product_variants": "product_variants.json.gz",
    "product_variant_attribute_values": "product_variant_attribute_values.json.gz",
    "product_images": "product_images.json.gz",
}


def write_gzip_json(path: Path, rows: list[dict]) -> int:
    payload = json.dumps(rows, separators=(",", ":")).encode("utf-8")
    compressed = gzip.compress(payload, compresslevel=9, mtime=0)
    path.write_bytes(compressed)
    return len(compressed)


def generate_all() -> dict[str, list[dict]]:
    rng = random.Random(SEED)

    manufacturers = generate_manufacturers(rng, MANUFACTURER_COUNT)
    brands = generate_brands(rng, BRAND_COUNT, [row["id"] for row in manufacturers])
    categories, leaves = generate_categories(CATEGORY_TREE)
    tags = generate_tags(TAG_NAMES)
    attributes, attribute_values, values_by_code, value_id_lookup = generate_attributes_and_values(ATTRIBUTE_DEFS)
    collections = generate_collections(COLLECTION_NAMES)
    products = generate_products(
        rng, count=PRODUCT_COUNT, brands=brands, leaves=leaves, top_meta=TOP_CATEGORY_META, values_by_code=values_by_code
    )
    variants, variant_attribute_values = generate_variants(
        rng,
        products=products,
        top_meta=TOP_CATEGORY_META,
        values_by_code=values_by_code,
        value_id_lookup=value_id_lookup,
        target_count=VARIANT_PRODUCT_TARGET,
    )
    images = generate_images(rng, products=products, variants=variants)
    collection_products = generate_collection_products(rng, collections=collections, products=products)
    product_tags = generate_product_tags(rng, products=products, tags=tags)

    return {
        "manufacturers": manufacturers,
        "brands": brands,
        "categories": categories,
        "tags": tags,
        "product_attributes": attributes,
        "attribute_values": attribute_values,
        "collections": collections,
        "products": products,
        "collection_products": collection_products,
        "product_tags": product_tags,
        "product_variants": variants,
        "product_variant_attribute_values": variant_attribute_values,
        "product_images": images,
    }


def main() -> None:
    start = time.monotonic()
    data = generate_all()

    try:
        validate_all(data)
    except ValueError as exc:
        print(f"Seed data validation failed: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    total_bytes = 0
    print(f"Writing seed data to {OUTPUT_DIR}")
    for key, filename in FILES.items():
        rows = data[key]
        size = write_gzip_json(OUTPUT_DIR / filename, rows)
        total_bytes += size
        print(f"  {filename:<45} {len(rows):>7} rows  {size:>10,} bytes")

    elapsed = time.monotonic() - start
    print(f"Done: {sum(len(rows) for rows in data.values())} total rows, {total_bytes:,} bytes compressed, {elapsed:.2f}s")


if __name__ == "__main__":
    main()
