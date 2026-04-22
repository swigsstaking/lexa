#!/usr/bin/env python3
"""Génère 20 images synthétiques pour bencher l'OCR vision.

10 certificats de salaire + 5 attestations 3a + 5 factures.
Chaque image a une ground-truth JSON associée (mêmes champs que les prompts Lexa).
"""
import json
import os
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

random.seed(42)
OUT = Path(__file__).parent / "dataset"
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


def make_salary(i: int) -> tuple[Image.Image, dict]:
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
        ("", 200),
        (f"Employeur: {emp[0]}", 240),
        (f"UID: {emp[1]}", 270),
        (f"Adresse: {emp[2]}", 300),
        ("", 350),
        (f"Employé: {name[0]}", 380),
        (f"NAVS: {name[1]}", 410),
        ("", 450),
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


def make_3a(i: int) -> tuple[Image.Image, dict]:
    inst = random.choice(INSTITUTIONS_3A)
    name = random.choice(NAMES)
    year = random.choice([2024, 2025, 2026])
    amount = random.choice([5_000, 6_500, 7_056, 7_260])

    img = Image.new("RGB", (1200, 1400), "white")
    d = ImageDraw.Draw(img)
    d.text((80, 80), "ATTESTATION PILIER 3A", fill="black", font=FONT_BIG)
    d.text((80, 130), f"{inst}", fill="black", font=FONT)
    lines = [
        (f"Titulaire: {name[0]}", 220),
        (f"NAVS: {name[1]}", 260),
        (f"Année fiscale: {year}", 320),
        (f"Cotisations versées: {amount} CHF", 380),
        (f"Déductible LIFD art. 33 al. 1 let. e", 440),
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


def make_invoice(i: int) -> tuple[Image.Image, dict]:
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
        (f"", 320),
        (f"Prestations", 340),
        (f"Total HT:        {amount_ht:>10.2f} CHF", 400),
        (f"TVA {tva_rate}%:       {tva:>10.2f} CHF", 440),
        (f"Total TTC:       {ttc:>10.2f} CHF", 480),
        (f"", 540),
        (f"IBAN: CH93 0076 2011 6238 5295 7", 580),
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
    dataset = []
    for i in range(10):
        img, gt = make_salary(i)
        fname = f"salary-{i+1:02d}.png"
        img.save(OUT / fname, "PNG")
        dataset.append({"file": fname, "ground_truth": gt})
    for i in range(5):
        img, gt = make_3a(i)
        fname = f"3a-{i+1:02d}.png"
        img.save(OUT / fname, "PNG")
        dataset.append({"file": fname, "ground_truth": gt})
    for i in range(5):
        img, gt = make_invoice(i)
        fname = f"invoice-{i+1:02d}.png"
        img.save(OUT / fname, "PNG")
        dataset.append({"file": fname, "ground_truth": gt})

    with (OUT / "ground_truth.json").open("w") as f:
        json.dump(dataset, f, indent=2, ensure_ascii=False)
    print(f"Generated {len(dataset)} images in {OUT}")


if __name__ == "__main__":
    main()
