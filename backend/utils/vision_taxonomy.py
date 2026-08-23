import logging
from typing import Tuple, Optional

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────────────────────────────────────
# TWO-TIER LABEL RESOLUTION MATRIX
# ──────────────────────────────────────────────────────────────────────────────

_TIER1_RULES: list[tuple[str, str, str]] = [
    # Tops sub-types
    ("polo",        "polo-shirt",   "top"),
    ("t-shirt",     "t-shirt",      "top"),
    ("tshirt",      "t-shirt",      "top"),
    ("tank",        "tank-top",     "top"),
    ("hoodie",      "hoodie",       "top"),
    ("sweatshirt",  "sweatshirt",   "top"),
    ("pullover",    "pullover",     "top"),
    ("cardigan",    "cardigan",     "top"),
    ("blazer",      "blazer",       "top"),
    ("suit",        "suit-jacket",  "top"),
    ("trench",      "trench-coat",  "top"),
    ("parka",       "parka",        "top"),
    ("windbreaker", "windbreaker",  "top"),
    ("jacket",      "jacket",       "top"),
    ("coat",        "coat",         "top"),
    ("blouse",      "blouse",       "top"),
    ("shirt",       "shirt",        "top"),
    ("jersey",      "jersey",       "top"),

    # Bottoms sub-types
    ("cargo",       "cargo-pants",  "bottom"),
    ("chino",       "chinos",       "bottom"),
    ("sweatpant",   "sweatpants",   "bottom"),
    ("trackpant",   "track-pants",  "bottom"),
    ("jogger",      "joggers",      "bottom"),
    ("legging",     "leggings",     "bottom"),
    ("tight",       "leggings",     "bottom"),
    ("jean",        "jeans",        "bottom"),
    ("denim",       "jeans",        "bottom"),
    ("shorts",      "shorts",       "bottom"),
    ("skirt",       "skirt",        "bottom"),
    ("trouser",     "trousers",     "bottom"),
    ("pantaloon",   "trousers",     "bottom"),
    ("kilt",        "kilt",         "bottom"),
    ("sarong",      "sarong",       "bottom"),
    
    # Ethnic/Traditional Tops
    ("kurta",       "kurta",        "top"),
    ("kurti",       "kurta",        "top"),
    ("tunic",       "tunic",        "top"),
    ("sherwani",    "sherwani",     "top"),
    ("choli",       "choli",        "top"),
    
    # Ethnic/Traditional Bottoms
    ("salwaar",     "salwaar",      "bottom"),
    ("salwar",      "salwaar",      "bottom"),
    ("churidar",    "churidar",     "bottom"),
    ("pajama",      "pajama",       "bottom"),
    ("lehenga",     "lehenga",      "bottom"),
    ("dhoti",       "dhoti",        "bottom"),
    ("saree",       "saree",        "top"),
    ("sari",        "saree",        "top"),

    # Footwear sub-types
    ("sneaker",     "sneakers",     "footwear"),
    ("trainer",     "sneakers",     "footwear"),
    ("running shoe","sneakers",     "footwear"),
    ("loafer",      "loafers",      "footwear"),
    ("moccasin",    "moccasins",    "footwear"),
    ("stiletto",    "heels",        "footwear"),
    ("pump",        "heels",        "footwear"),
    ("sandal",      "sandals",      "footwear"),
    ("flip-flop",   "flip-flops",   "footwear"),
    ("slipper",     "slippers",     "footwear"),
    ("clog",        "clogs",        "footwear"),
    ("boot",        "boots",        "footwear"),
    ("shoe",        "shoes",        "footwear"),

    # Accessory sub-types
    ("sunglasses",  "sunglasses",   "accessory"),
    ("watch",       "watch",        "accessory"),
    ("bow tie",     "bow-tie",      "accessory"),
    ("tie",         "tie",          "accessory"),
    ("scarf",       "scarf",        "accessory"),
    ("glove",       "gloves",       "accessory"),
    ("belt",        "belt",         "accessory"),
    ("hat",         "hat",          "accessory"),
    ("cap",         "cap",          "accessory"),
    ("necklace",    "necklace",     "accessory"),
    ("bracelet",    "bracelet",     "accessory"),
    ("handbag",     "handbag",      "accessory"),
    ("purse",       "purse",        "accessory"),
    ("backpack",    "backpack",     "accessory"),
    ("umbrella",    "umbrella",     "accessory"),
    ("sock",        "socks",        "accessory"),
]

_TIER2_TOPS      = {"jersey","t-shirt","tshirt","sweatshirt","pullover","cardigan",
                    "suit","shirt","blouse","coat","jacket","parka","windbreaker",
                    "trench","hoodie","tank","polo"}
_TIER2_BOTTOMS   = {"jean","trouser","skirt","shorts","leggings","pantaloon","kilt","sarong",
                     "pant","cargo","jogger","sweatpant","chino","trackpant"}
_TIER2_FOOTWEAR  = {"shoe","sneaker","boot","loafer","sandal","clog","slipper",
                    "moccasin","flip-flop","stiletto","pump"}
_TIER2_ACCESSORY = {"watch","sunglasses","hat","cap","scarf","glove","belt",
                    "tie","bow tie","necklace","bracelet","handbag","purse",
                    "backpack","umbrella","sock"}

def _resolve_label(label: str) -> Tuple[Optional[str], Optional[str]]:
    label_lower = label.lower()

    for token, sub_type, category in _TIER1_RULES:
        if token in label_lower:
            return sub_type, category

    for kw in _TIER2_TOPS:
        if kw in label_lower:
            return kw, "top"
    for kw in _TIER2_BOTTOMS:
        if kw in label_lower:
            return kw, "bottom"
    for kw in _TIER2_FOOTWEAR:
        if kw in label_lower:
            return kw, "footwear"
    for kw in _TIER2_ACCESSORY:
        if kw in label_lower:
            return kw, "accessory"

    return None, None

_TIER3_SPECIFIC_MAP: dict[str, list[tuple[str, str]]] = {
    "jeans": [
        ("bell",       "bell_bottom"), ("flare",      "bell_bottom"),
        ("bootcut",    "bootcut"), ("baggy",      "baggy"),
        ("loose",      "baggy"), ("wide",       "wide_leg"),
        ("skinny",     "skinny"), ("slim",       "slim_fit"),
        ("straight",   "straight_cut"), ("tapered",    "tapered"),
        ("mom",        "mom_jeans"), ("boyfriend",  "boyfriend"),
        ("high waist", "high_waist"), ("ripped",     "ripped"),
        ("distressed", "ripped"),
    ],
    "trousers": [
        ("cargo",   "cargo"), ("chino",   "chino"), ("formal",  "formal"),
        ("dress",   "formal"), ("wide",    "wide_leg"), ("baggy",   "baggy"),
        ("tapered", "tapered"), ("slim",    "slim_fit"), ("pleated", "pleated"),
    ],
    "cargo-pants": [
        ("slim",   "slim_cargo"), ("baggy",  "baggy_cargo"),
        ("camo",   "camo_cargo"), ("short",  "cargo_shorts"),
    ],
    "shorts": [
        ("denim",   "denim_shorts"), ("cargo",   "cargo_shorts"),
        ("board",   "board_shorts"), ("chino",   "chino_shorts"),
        ("biker",   "biker_shorts"), ("athletic","athletic_shorts"),
        ("mini",    "mini_shorts"),
    ],
    "t-shirt": [
        ("oversized",  "oversized_t-shirt"), ("crop",       "crop_top"),
        ("graphic",    "graphic_tee"), ("plain",      "plain_tee"),
        ("longline",   "longline_tee"), ("pocket",     "pocket_tee"),
        ("v-neck",     "v_neck_tee"), ("round",      "crew_neck_tee"),
    ],
    "shirt": [
        ("tunic",     "tunic"), ("formal",    "formal_shirt"),
        ("oxford",    "oxford_shirt"), ("flannel",   "flannel_shirt"),
        ("denim",     "denim_shirt"), ("oversized", "oversized_shirt"),
        ("crop",      "crop_shirt"), ("linen",     "linen_shirt"),
        ("polo",      "polo_shirt"), ("hawaiian",  "hawaiian_shirt"),
        ("check",     "check_shirt"), ("stripe",    "striped_shirt"),
    ],
    "hoodie": [
        ("zip",       "zip_hoodie"), ("pullover",  "pullover_hoodie"),
        ("oversized", "oversized_hoodie"), ("crop",      "crop_hoodie"),
        ("graphic",   "graphic_hoodie"),
    ],
    "jacket": [
        ("leather",  "leather_jacket"), ("denim",    "denim_jacket"),
        ("bomber",   "bomber_jacket"), ("puffer",   "puffer_jacket"),
        ("blazer",   "blazer"), ("varsity",  "varsity_jacket"),
        ("rain",     "rain_jacket"), ("track",    "track_jacket"),
        ("biker",    "biker_jacket"),
    ],
    "dress": [
        ("mini",    "mini_dress"), ("midi",    "midi_dress"),
        ("maxi",    "maxi_dress"), ("bodycon", "bodycon_dress"),
        ("wrap",    "wrap_dress"), ("shirt",   "shirt_dress"),
        ("slip",    "slip_dress"), ("floral",  "floral_dress"),
    ],
    "sneakers": [
        ("chunky",    "chunky_sneaker"), ("platform",  "platform_sneaker"),
        ("high",      "high_top"), ("low",       "low_top"),
        ("running",   "running_shoe"), ("trainer",   "trainer"),
        ("canvas",    "canvas_sneaker"), ("leather",   "leather_sneaker"),
    ],
    "boots": [
        ("chelsea",   "chelsea_boot"), ("ankle",     "ankle_boot"),
        ("knee",      "knee_high_boot"), ("combat",    "combat_boot"),
        ("cowboy",    "cowboy_boot"), ("rain",      "rain_boot"),
        ("lace",      "lace_up_boot"), ("platform",  "platform_boot"),
    ],
    "skirt": [
        ("mini",    "mini_skirt"), ("midi",    "midi_skirt"),
        ("maxi",    "maxi_skirt"), ("pleated", "pleated_skirt"),
        ("pencil",  "pencil_skirt"), ("wrap",    "wrap_skirt"),
        ("denim",   "denim_skirt"), ("flared",  "flared_skirt"),
    ],
}

def _resolve_specific_type(sub_type: str, label_tokens: str) -> str:
    sub_root = sub_type.lower().strip()
    label_lower = label_tokens.lower()

    rules = _TIER3_SPECIFIC_MAP.get(sub_root)
    if rules is None:
        for alias_key in _TIER3_SPECIFIC_MAP:
            if alias_key in sub_root or sub_root in alias_key:
                rules = _TIER3_SPECIFIC_MAP[alias_key]
                break

    if rules is None:
        return ""

    for token, specific_label in rules:
        if token in label_lower:
            return specific_label

    return ""


_CLOTHING_SIGNAL_VOCAB: frozenset[str] = frozenset({
    "shirt", "t-shirt", "tshirt", "jersey", "blouse", "tunic", "hoodie",
    "sweatshirt", "pullover", "cardigan", "blazer", "jacket", "coat",
    "parka", "trench", "windbreaker", "vest", "tank", "polo", "crop",
    "jean", "denim", "trouser", "pant", "shorts", "skirt", "legging",
    "cargo", "chino", "jogger", "trackpant", "sweatpant", "kilt",
    "shoe", "sneaker", "boot", "sandal", "loafer", "heel", "pump",
    "slipper", "clog", "moccasin", "trainer",
    "tie", "scarf", "glove", "belt", "hat", "cap", "sock", "watch",
    "necklace", "bracelet", "handbag", "backpack",
    "dress", "gown", "suit", "uniform", "kimono", "robe", "overall",
    "jumpsuit", "romper", "sari", "saree", "kurta", "kurti", "salwar",
    "salwaar", "churidar", "dhoti", "lehenga", "sherwani", "choli", "dupatta"
})


SHARED_WEARABLES_LIST: list[str] = [
    "clothing", "apparel", "top", "bottom", "garment", "suit", "dress",
    "shirt", "pants", "kurti", "lehenga", "blouse", "kurta", "tee", "t-shirt",
    "tank", "jacket", "coat", "blazer", "hoodie", "sweater", "cardigan",
    "vest", "tunic", "gown", "saree", "sari", "choli", "dupatta", "anarkali",
    "kameez", "sherwani", "kurta-pyjama", "salwar", "dhoti", "lungi",
    "skirt", "trousers", "jeans", "shorts", "leggings", "pyjama", "cargo",
    "wear", "outfit", "attire",
    "footwear", "shoes", "sandal", "slipper", "heels", "boots", "shoe",
    "sandals", "slippers", "sneakers", "loafers", "flats", "chappal", "jutti",
    "a vehicle, car, landscape, animal, document paper, or non-clothing object",
]

_WEARABLE_CANONICAL_MAP: dict[str, str] = {
    "clothing": "top", "apparel": "top", "garment": "top", "wear": "top",
    "outfit": "top", "attire": "top", "shirt": "top", "blouse": "top",
    "kurti": "top", "kurta": "top", "top": "top", "tee": "top",
    "t-shirt": "top", "tank": "top", "jacket": "top", "coat": "top",
    "blazer": "top", "hoodie": "top", "sweater": "top", "cardigan": "top",
    "vest": "top", "tunic": "top", "dress": "top", "gown": "top",
    "saree": "top", "sari": "top", "lehenga": "top", "choli": "top",
    "dupatta": "top", "anarkali": "top", "kameez": "top", "suit": "top",
    "sherwani": "top", "kurta-pyjama": "top",
    "salwar": "bottom", "dhoti": "bottom", "lungi": "bottom",
    "skirt": "bottom", "pants": "bottom", "trousers": "bottom",
    "jeans": "bottom", "shorts": "bottom", "leggings": "bottom",
    "bottom": "bottom", "pyjama": "bottom", "cargo": "bottom",
    "footwear": "footwear", "shoes": "footwear", "shoe": "footwear",
    "sandal": "footwear", "sandals": "footwear", "slipper": "footwear",
    "slippers": "footwear", "heels": "footwear", "boots": "footwear",
    "sneakers": "footwear", "loafers": "footwear", "flats": "footwear",
    "chappal": "footwear", "jutti": "footwear",
}

def _has_clothing_signal(label_corpus: str) -> bool:
    corpus_lower = label_corpus.lower()
    return any(token in corpus_lower for token in _CLOTHING_SIGNAL_VOCAB)


_YOLO_TAXONOMY: dict[str, tuple[str, str]] = {
    "short sleeve top":     ("top", "t-shirt"),
    "long sleeve top":      ("top", "shirt"),
    "short sleeve outwear": ("top", "jacket"),
    "long sleeve outwear":  ("top", "coat"),
    "vest":                 ("top", "vest"),
    "sling":                ("top", "sling-top"),
    "shorts":               ("bottom", "shorts"),
    "trousers":             ("bottom", "cargo-pants"),  # let zero-shot refine further
    "pants":                ("bottom", "cargo-pants"),
    "cargo pants":          ("bottom", "cargo-pants"),
    "cargo":                ("bottom", "cargo-pants"),
    "military pants":       ("bottom", "cargo-pants"),
    "skirt":                ("bottom", "skirt"),
    "short sleeve dress":   ("top", "dress"),
    "long sleeve dress":    ("top", "dress"),
    "vest dress":           ("top", "dress"),
    "sling dress":          ("top", "dress"),
}

def _yolo_class_to_taxonomy(cls_name: str) -> tuple[Optional[str], Optional[str]]:
    key = cls_name.lower().strip()
    if key in _YOLO_TAXONOMY:
        return _YOLO_TAXONOMY[key]
    return _resolve_label(cls_name)


_CATEGORY_TITLE: dict[str, str] = {
    "top":       "Top",
    "bottom":    "Bottom",
    "footwear":  "Footwear",
    "accessory": "Accessory",
}


FASHION_HIERARCHY = {
    "top": {
        "labels": ["crop top", "t-shirt", "long sleeve top", "tank top", "oversized t-shirt", "formal shirt", "cotton kurti", "synthetic kurti", "blouse", "hoodie", "sweatshirt", "sweater", "jacket", "coat", "cardigan"],
        "default": "t-shirt",
        "season_map": {
            "crop top": ["summer"], "t-shirt": ["summer", "monsoon"], "long sleeve top": ["summer", "monsoon", "winter", "festive_spring"],
            "tank top": ["summer", "monsoon"], "oversized t-shirt": ["summer", "monsoon"], "formal shirt": ["summer", "monsoon", "festive_spring", "winter"],
            "cotton kurti": ["summer", "festive_spring"], "synthetic kurti": ["monsoon"], "blouse": ["festive_spring", "summer"],
            "hoodie": ["winter"], "sweatshirt": ["winter"], "sweater": ["winter"], "jacket": ["winter"], "coat": ["winter"], "cardigan": ["winter"]
        },
        "occasion_map": {
            "crop top": ["casual", "party_clubbing"], "t-shirt": ["casual", "college_daily", "lounge_sleepwear"],
            "long sleeve top": ["casual", "college_daily", "office_formal"], "tank top": ["casual", "gym_activewear", "lounge_sleepwear"],
            "oversized t-shirt": ["casual", "college_daily", "lounge_sleepwear"], "formal shirt": ["office_formal"],
            "cotton kurti": ["casual", "college_daily", "festive"], "synthetic kurti": ["casual", "college_daily"],
            "blouse": ["festive", "wedding_heavy", "party_clubbing"], "hoodie": ["casual", "college_daily"],
            "sweatshirt": ["casual", "college_daily", "gym_activewear"], "sweater": ["casual", "office_formal"],
            "jacket": ["casual", "party_clubbing"], "coat": ["office_formal", "party_clubbing"], "cardigan": ["casual", "office_formal"]
        }
    },
    "bottom": {
        "labels": [
            "baggy jeans", "skinny jeans", "bell bottom jeans", "straight jeans",
            "cargo pants", "cargo-pants", "military cargo pants", "formal trousers",
            "chinos", "joggers", "sweatpants", "track pants",
            "shorts", "denim shorts", "skirts", "leggings"
        ],
        "default": "jeans",
        "season_map": {
            "baggy jeans": ["summer", "monsoon", "festive_spring", "winter"],
            "skinny jeans": ["summer", "monsoon", "festive_spring", "winter"],
            "bell bottom jeans": ["summer", "monsoon", "festive_spring", "winter"],
            "straight jeans": ["summer", "monsoon", "festive_spring", "winter"],
            "cargo pants": ["summer", "monsoon", "winter"],
            "cargo-pants": ["summer", "monsoon", "winter"],
            "military cargo pants": ["summer", "monsoon", "winter"],
            "formal trousers": ["summer", "monsoon", "festive_spring", "winter"],
            "chinos": ["summer", "monsoon", "festive_spring", "winter"],
            "joggers": ["summer", "monsoon", "winter"],
            "sweatpants": ["monsoon", "winter"],
            "track pants": ["summer", "monsoon"],
            "shorts": ["summer", "monsoon"],
            "denim shorts": ["summer", "monsoon"],
            "skirts": ["summer", "monsoon"],
            "leggings": ["summer", "monsoon", "winter"]
        },
        "occasion_map": {
            "baggy jeans": ["casual", "college_daily", "party_clubbing"],
            "skinny jeans": ["casual", "college_daily", "party_clubbing"],
            "bell bottom jeans": ["casual", "party_clubbing"],
            "straight jeans": ["casual", "college_daily"],
            "cargo pants": ["casual", "college_daily"],
            "cargo-pants": ["casual", "college_daily"],
            "military cargo pants": ["casual", "college_daily"],
            "formal trousers": ["office_formal"],
            "chinos": ["casual", "office_formal", "college_daily"],
            "joggers": ["casual", "gym_activewear", "lounge_sleepwear"],
            "sweatpants": ["casual", "gym_activewear", "lounge_sleepwear"],
            "track pants": ["gym_activewear", "casual"],
            "shorts": ["casual", "lounge_sleepwear", "gym_activewear"],
            "denim shorts": ["casual", "college_daily"],
            "skirts": ["casual", "party_clubbing", "festive"],
            "leggings": ["casual", "gym_activewear", "lounge_sleepwear"]
        }
    },
    "outfit": {
        "labels": ["lehenga", "coord set", "anarkali suit", "alia cut suit", "punjabi suit", "sharara suit", "salwar kameez", "jumpsuit", "one-piece dress", "gown"],
        "default": "one-piece dress",
        "season_map": {
            "lehenga": ["festive_spring"], "coord set": ["summer", "monsoon"], "anarkali suit": ["festive_spring"], "alia cut suit": ["festive_spring"],
            "punjabi suit": ["festive_spring", "summer", "monsoon", "winter"], "sharara suit": ["festive_spring"],
            "salwar kameez": ["summer", "monsoon", "festive_spring", "winter"], "jumpsuit": ["summer", "monsoon"],
            "one-piece dress": ["summer", "monsoon"], "gown": ["festive_spring"]
        },
        "occasion_map": {
            "lehenga": ["wedding_heavy", "festive"], "coord set": ["casual", "college_daily", "party_clubbing"],
            "anarkali suit": ["festive", "wedding_heavy"], "alia cut suit": ["festive"], "punjabi suit": ["festive", "college_daily"],
            "sharara suit": ["festive", "wedding_heavy"], "salwar kameez": ["casual", "festive"], "jumpsuit": ["party_clubbing", "casual"],
            "one-piece dress": ["party_clubbing", "casual"], "gown": ["wedding_heavy", "party_clubbing"]
        }
    },
    "footwear": {
        "labels": ["sneakers", "boots", "heels", "sandals", "slippers", "flat shoes"],
        "default": "shoes",
        "season_map": {
            "sneakers": ["summer", "festive_spring", "winter"], "boots": ["winter"], "heels": ["festive_spring", "summer"],
            "sandals": ["monsoon", "summer"], "slippers": ["monsoon", "summer"], "flat shoes": ["summer", "monsoon", "festive_spring", "winter"]
        },
        "occasion_map": {
            "sneakers": ["casual", "college_daily", "party_clubbing", "gym_activewear"], "boots": ["party_clubbing", "casual"],
            "heels": ["party_clubbing", "festive", "wedding_heavy", "office_formal"], "sandals": ["casual", "festive"],
            "slippers": ["casual", "lounge_sleepwear"], "flat shoes": ["casual", "office_formal", "college_daily"]
        }
    },
    "accessory": {
        "labels": ["watch", "sunglasses", "handbag", "purse", "backpack", "belt", "scarf", "hat", "cap", "necklace", "earrings", "bracelet"],
        "default": "accessory",
        "season_map": {
            "watch": ["summer", "monsoon", "festive_spring", "winter"], "sunglasses": ["summer", "festive_spring"],
            "handbag": ["summer", "monsoon", "festive_spring", "winter"], "purse": ["summer", "monsoon", "festive_spring", "winter"],
            "backpack": ["summer", "monsoon", "festive_spring", "winter"], "belt": ["summer", "monsoon", "festive_spring", "winter"],
            "scarf": ["winter"], "hat": ["summer", "festive_spring"], "cap": ["summer", "monsoon"],
            "necklace": ["summer", "monsoon", "festive_spring", "winter"], "earrings": ["summer", "monsoon", "festive_spring", "winter"],
            "bracelet": ["summer", "monsoon", "festive_spring", "winter"]
        },
        "occasion_map": {
            "watch": ["casual", "office_formal", "party_clubbing"], "sunglasses": ["casual", "party_clubbing"],
            "handbag": ["casual", "office_formal"], "purse": ["casual", "party_clubbing"], "backpack": ["casual", "college_daily"],
            "belt": ["casual", "office_formal"], "scarf": ["casual", "college_daily"], "hat": ["casual"], "cap": ["casual", "gym_activewear"],
            "necklace": ["party_clubbing", "festive", "wedding_heavy"], "earrings": ["party_clubbing", "festive", "wedding_heavy"],
            "bracelet": ["casual", "party_clubbing"]
        }
    }
}

def _resolve_seasons_for_item(category: str, sub_type: str) -> list[str]:
    cat_lower = category.lower()
    sub_lower = sub_type.lower()
    cat_data = FASHION_HIERARCHY.get(cat_lower)
    if not cat_data:
        return ["summer"]
    return cat_data.get("season_map", {}).get(sub_lower, ["summer"])

def _resolve_occasions_for_item(category: str, sub_type: str) -> list[str]:
    cat_lower = category.lower()
    sub_lower = sub_type.lower()
    cat_data = FASHION_HIERARCHY.get(cat_lower)
    if not cat_data:
        return ["casual"]
    return cat_data.get("occasion_map", {}).get(sub_lower, ["casual"])

_ALL_FASHION_LABELS = []
_LABEL_TO_CATEGORY = {}
for _cat_key, _cat_data in FASHION_HIERARCHY.items():
    for _lbl in _cat_data["labels"]:
        _ALL_FASHION_LABELS.append(_lbl)
        _LABEL_TO_CATEGORY[_lbl] = _cat_key
