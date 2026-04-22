#!/usr/bin/env python3
"""Dataset v2 enrichi — simule des scans réels imparfaits.

50 documents synthétiques avec 3 niveaux de dégradation :
- clean   : image nette (équivalent v1)
- soft    : bruit gaussien léger + rotation ±2° + marges irrégulières
- rough   : bruit gaussien fort + rotation ±8° + flou gaussien + basse-res
            + fond bruité (simulation photo prise à main levée)

Répartition : 25 salaires + 15 attestations 3a + 10 factures, chaque
catégorie en 50% clean / 30% soft / 20% rough pour refléter un mix réaliste.
"""
import io
import json
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

random.seed(42)
OUT = Path(__file__).parent / "dataset_v2"
OUT.mkdir(exist_ok=True)

try:
    FONT = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 22)
    FONT_BIG = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 32)
except Exception:
    FONT = ImageFont.load_default()
    FONT_BIG = FONT

EMPLOYERS = [
    ("Swigs SA", "CHE-123.456.789", "Rue du Midi 22, 1530 Payerne"),
    ("Migros Genève", "CHE-116.308.287", "Rue de Carouge 50, 1205 Genève"),
    ("CFF SA", "CHE-115.932.017", "Hochschulstrasse 6, 3000 Bern 65"),
    ("Nestlé Suisse", "CHE-105.840.816", "Avenue Nestlé 55, 1800 Vevey"),
    ("Raiffeisen VS", "CHE-108.244.893", "Rue du Bourg 7, 1920 Martigny"),
]
NAMES = [
    ("Marie Rochat", "756.1234.5678.90"),
    ("Jean Dupont", "756.9876.5432.11"),
    ("Sophie Mueller", "756.1111.2222.33"),
    ("Thomas Rey", "756.5555.6666.77"),
    ("Léa Bernasconi", "756.3333.4444.55"),
]
INSTITUTIONS_3A = ["UBS 3a", "PostFinance 3a", "Credit Suisse 3a", "Raiffeisen 3a", "Swiss Life 3a"]
VENDORS = ["Apple Switzerland", "Swisscom AG", "Ricoh Switzerland", "Migros Online", "SBB Ticket"]


# ── Dégradations ──────────────────────────────────────────────────────────────

def add_noise(img: Image.Image, strength: int) -> Image.Image:
    """Ajoute du bruit gaussien blanc/noir uniforme."""
    import struct
    px = img.load()
    w, h = img.size
    for _ in range(int(w * h * strength / 1000)):
        x = random.randint(0, w - 1)
        y = random.randint(0, h - 1)
        delta = random.randint(-strength * 10, strength * 10)
        r, g, b = px[x, y][:3]
        px[x, y] = (
            max(0, min(255, r + delta)),
            max(0, min(255, g + delta)),
            max(0, min(255, b + delta)),
        )
    return img


def tinted_background(img: Image.Image, tint: tuple[int, int, int]) -> Image.Image:
    """Applique un léger tint au fond (simule éclairage ambiant non-pur blanc)."""
    overlay = Image.new("RGB", img.size, tint)
    return Image.blend(img, overlay, 0.08)


def apply_degradation(img: Image.Image, level: str) -> Image.Image:
    if level == "clean":
        return img
    if level == "soft":
        angle = random.uniform(-2, 2)
        img = img.rotate(angle, expand=True, fillcolor="white")
        img = add_noise(img, strength=3)
        img = tinted_background(img, (248, 244, 232))  # légère teinte ivoire
        # marges asymmétriques : crop un peu
        w, h = img.size
        crop = (
            random.randint(10, 30),
            random.randint(10, 40),
            w - random.randint(10, 30),
            h - random.randint(10, 30),
        )
        img = img.crop(crop)
        return img
    if level == "rough":
        # rotation plus forte
        angle = random.uniform(-8, 8)
        img = img.rotate(angle, expand=True, fillcolor="white")
        # basse-res : downsize puis upscale (perte info)
        w, h = img.size
        img = img.resize((w // 2, h // 2), Image.BILINEAR)
        img = img.resize((w, h), Image.BILINEAR)
        # flou gaussien léger
        img = img.filter(ImageFilter.GaussianBlur(radius=1.0))
        # bruit fort
        img = add_noise(img, strength=8)
        # tint prononcé (photo au flash jaune)
        img = tinted_background(img, (240, 230, 210))
        # crop marges irrégulières
        w, h = img.size
        crop = (
            random.randint(20, 60),
            random.randint(20, 80),
            w - random.randint(20, 60),
            h - random.randint(20, 60),
        )
        img = img.crop(crop)
        return img
    raise ValueError(f"unknown level {level}")


# ── Générateurs de contenu ────────────────────────────────────────────────────

def make_salary() -> tuple[Image.Image, dict]:
    emp = random.choice(EMPLOYERS)
    name = random.choice(NAMES)
    year = random.choice([2024, 2025, 2026])
    gross = random.randint(60_000, 150_000)
    bonus = random.choice([0, 3_000, 5_000, 8_000, 12_000])
    total = gross + bonus
    ahv = round(total * 0.055)
    lpp = round(total * 0.085)

    img = Image.new("RGB", (1200, 1600), "white")
    d = ImageDraw.Draw(img)
    d.text((80, 80), "CERTIFICAT DE SALAIRE", fill="black", font=FONT_BIG)
    d.text((80, 130), f"Année {year}", fill="black", font=FONT)
    lines = [
        (f"Employeur: {emp[0]}", 240),
        (f"UID: {emp[1]}", 270),
        (f"Adresse: {emp[2]}", 300),
        (f"Employé: {name[0]}", 380),
        (f"NAVS: {name[1]}", 410),
        (f"Case 1 - Salaire annuel brut AVS:  {gross:>10} CHF", 500),
        (f"Case 7 - Autres prestations:       {bonus:>10} CHF", 540),
        (f"Case 8 - Total salaire brut:       {total:>10} CHF", 580),
        (f"Case 9 - AVS/AI/APG/AC:            {ahv:>10} CHF", 620),
        (f"Case 10 - LPP:                     {lpp:>10} CHF", 660),
    ]
    for text, y in lines:
        d.text((80, y), text, fill="black", font=FONT)
    return img, {
        "category": "salary",
        "employer_name": emp[0],
        "employer_uid": emp[1],
        "employee_name": name[0],
        "year": year,
        "gross_annual_salary": gross,
        "bonus": bonus,
        "ahv_ai_apg": ahv,
        "lpp_employee": lpp,
    }


def make_3a() -> tuple[Image.Image, dict]:
    inst = random.choice(INSTITUTIONS_3A)
    name = random.choice(NAMES)
    year = random.choice([2024, 2025, 2026])
    amount = random.choice([5_000, 6_500, 7_056, 7_260])

    img = Image.new("RGB", (1200, 1400), "white")
    d = ImageDraw.Draw(img)
    d.text((80, 80), "ATTESTATION PILIER 3A", fill="black", font=FONT_BIG)
    d.text((80, 130), inst, fill="black", font=FONT)
    lines = [
        (f"Titulaire: {name[0]}", 220),
        (f"NAVS: {name[1]}", 260),
        (f"Année fiscale: {year}", 320),
        (f"Cotisations versées: {amount} CHF", 380),
        ("Déductible LIFD art. 33 al. 1 let. e", 440),
    ]
    for text, y in lines:
        d.text((80, y), text, fill="black", font=FONT)
    return img, {
        "category": "3a",
        "institution": inst,
        "contributor_name": name[0],
        "year": year,
        "amount": amount,
    }


def make_invoice() -> tuple[Image.Image, dict]:
    vendor = random.choice(VENDORS)
    inv_num = f"FAC-{random.randint(2024, 2026)}-{random.randint(1, 9999):04d}"
    date_d = random.randint(1, 28)
    date_m = random.randint(1, 12)
    year = random.choice([2024, 2025, 2026])
    amount_ht = random.randint(100, 5000)
    tva_rate = 8.1
    tva = round(amount_ht * tva_rate / 100, 2)
    ttc = round(amount_ht + tva, 2)

    img = Image.new("RGB", (1200, 1400), "white")
    d = ImageDraw.Draw(img)
    d.text((80, 80), "FACTURE", fill="black", font=FONT_BIG)
    d.text((80, 130), vendor, fill="black", font=FONT)
    lines = [
        (f"N°: {inv_num}", 220),
        (f"Date: {date_d:02d}.{date_m:02d}.{year}", 260),
        ("Prestations", 340),
        (f"Total HT:        {amount_ht:>10.2f} CHF", 400),
        (f"TVA {tva_rate}%:       {tva:>10.2f} CHF", 440),
        (f"Total TTC:       {ttc:>10.2f} CHF", 480),
        ("IBAN: CH93 0076 2011 6238 5295 7", 580),
    ]
    for text, y in lines:
        d.text((80, y), text, fill="black", font=FONT)
    return img, {
        "category": "invoice",
        "vendor": vendor,
        "invoice_number": inv_num,
        "date": f"{year}-{date_m:02d}-{date_d:02d}",
        "amount_ht": amount_ht,
        "tva": tva,
        "amount_ttc": ttc,
    }


def main():
    # Distribution : 50% clean / 30% soft / 20% rough
    def pick_level(i: int, total: int) -> str:
        r = i / total
        if r < 0.5:
            return "clean"
        if r < 0.8:
            return "soft"
        return "rough"

    dataset = []
    # 25 salaires
    for i in range(25):
        img, gt = make_salary()
        level = pick_level(i, 25)
        img = apply_degradation(img, level)
        fname = f"salary-{i+1:02d}-{level}.png"
        img.save(OUT / fname, "PNG")
        gt["_level"] = level
        dataset.append({"file": fname, "ground_truth": gt})
    # 15 3a
    for i in range(15):
        img, gt = make_3a()
        level = pick_level(i, 15)
        img = apply_degradation(img, level)
        fname = f"3a-{i+1:02d}-{level}.png"
        img.save(OUT / fname, "PNG")
        gt["_level"] = level
        dataset.append({"file": fname, "ground_truth": gt})
    # 10 factures
    for i in range(10):
        img, gt = make_invoice()
        level = pick_level(i, 10)
        img = apply_degradation(img, level)
        fname = f"invoice-{i+1:02d}-{level}.png"
        img.save(OUT / fname, "PNG")
        gt["_level"] = level
        dataset.append({"file": fname, "ground_truth": gt})

    with (OUT / "ground_truth.json").open("w") as f:
        json.dump(dataset, f, indent=2, ensure_ascii=False)

    # Stats par niveau
    from collections import Counter
    levels = Counter(d["ground_truth"]["_level"] for d in dataset)
    print(f"Generated {len(dataset)} images in {OUT}")
    print(f"Distribution: {dict(levels)}")


if __name__ == "__main__":
    main()
