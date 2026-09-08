import argparse
import os
import sys
from datetime import datetime, date, time, timedelta
import supabase
import random
import json
import keyring
import certifi
import httpx
os.environ["SSL_CERT_FILE"] = certifi.where()


SUPABASE_URL = os.getenv("SUPABASE_DEV_URL")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_DEV_ANON_KEY")
SUPABASE_SERVICE_ROLE_KEY = keyring.get_password("planetraves.dev.servicerolekey", "planetraves")
SUPABASE_IMAGE_STORAGE = f"{SUPABASE_URL}/storage/v1/object/public/event-images/"
EVENTS_FILE = os.path.expandvars("$PROJECT_ROOT_FOLDER\\test\\dummy-events.json")
USERS_FILE = os.path.expandvars("$PROJECT_ROOT_FOLDER\\test\\dummy-users.json")
USER_EMAIL_PREFIX = "testuser"
USER_NAME_PREFIX = "Test User"
USER_OFFICIAL_REQUEST_DETAIL = f"Bonjour je suis une association qui organise des GROS concerts partout ici et ailleurs.\n\n Je veux publier vite vite vite s'il vous plait.\n\nMon numéro: 06.01.02.03.04\n\nMon site: https://heeeeeeeey.com/"
TEST_TAGS = [
    "rock",
    "festival",
    "enfant",
    "cirque",
    "jazz",
    "theatre",
    "electro",
    "clown",
    "accoustique",
    "Trans punk fusion musette qui pique"
]

OPTIONS=supabase.ClientOptions(httpx_client=httpx.Client(verify=False))



class BytesDumpEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, bytes):
            return obj.decode()
        return json.JSONEncoder.default(self, obj)


class BytesDumpDecoder(json.JSONDecoder):
    def default(self, obj):
        if isinstance(obj, bytes):
            return obj.decode()
        return json.JSONDecoder.decode(self, obj)
    

def write_event_file(events: list):
    print("write events in file...")
    data = json.dumps(events, indent=4, ensure_ascii=False, cls=BytesDumpEncoder)
    with open(EVENTS_FILE, "wb") as _f:
        _f.write(data.encode('utf-8'))

def write_user_file(users: list):
    print("write users in file...")
    data = json.dumps(users, indent=4, ensure_ascii=False, cls=BytesDumpEncoder)
    with open(USERS_FILE, "wb") as _f:
        _f.write(data.encode('utf-8'))


def delete_events():
    print("delete all 'is_test' events...")
    supabase_db: supabase.Client = supabase.create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, options=OPTIONS)
    supabase_db.table("events").delete().eq("is_test", True).execute()


def delete_users():
    print("delete all 'testusers' users...")
    supabase_db: supabase.Client = supabase.create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, options=OPTIONS)
    page = 1
    per_page = 1000
    while True:
        resp = supabase_db.auth.admin.list_users(page=page, per_page=per_page)
        if len(resp) == 0:
            break
        to_delete = [u for u in resp if (u.email or "").startswith("testuser")]
        for u in to_delete:
            supabase_db.auth.admin.delete_user(u.id)
        page += 1


def format_event_payload(day_delta, category, title, pending):
    price = random.randrange(3)
    if price == 2:
        min_price = round(random.choice([0, random.uniform(0.0, 4.0)]), 2)
        max_price = round(random.uniform(5.0, 40.0), 2)
    else:
        min_price = max_price = 0

    if category == 0:
        image = "celine.webp"
        location_name = random.choice(["Café du bord du monde", "Chez l'Olive", "Café des Sports", "Dans la ruelle a coté de la pharmarcie derrière le panneau vert"])
    elif category == 1:
        image = "cirque.webp"
        location_name = random.choice(["Colo N Co", "Le Pré Vert", "La Briqueterie"])
    elif category == 2:
        image = "projection.webp"
        location_name = random.choice(["La Halle", "La confiserie", "Chez Vincent", "Promenade des Lices"])
    elif category == 3:
        image = "peinture.webp"
        location_name = random.choice(["Musé Des Arts", "Au Cercle", "Café du bord du monde", "Chez Jeanine"])
    elif category == 4:
        image = "books.jpg"
        location_name = random.choice(["Musé Des Livres", "La confiserie", "Chez Julien", "Au livre enchainé"])
    else:
        image = "misc.webp"
        location_name = random.choice(["Café des Sports", "La Halle", "Chez L'Olive", "Le Rouge en mélée"])

    min_age = random.choice([None, random.randrange(12)])
    if min_age is not None:
        max_age = random.choice([None, random.randrange(min_age + 1, 13)])
    else:
        max_age = random.choice([None, random.randrange(6, 10)])

    location_address_code = random.choice(["81800", "81630", f"81{random.randrange(800, 899)}"])
    if location_address_code == "81800":
        location_address_town = random.choice(["Rabastens", "Coufouleux"])
    elif location_address_code == "81630":
        location_address_town = "Salvagnac" 
    else:
        location_address_town = random.choice(["Saint-Sulpice", "Salvagnac", "Loupiac", "L'Isle-sur-Tarn"])

    return {
        "created_by": "f2bb3c93-cb32-44e6-8f02-c3f819edb2c4",
        "creator_name": "Olivier Gohier",
        "email": random.choice([None, "olivier.gohier@protonmail.com"]),
        "title": title,
        "is_test": True,
        "category": category,
        "event_date": (date.today() + timedelta(days=day_delta)).isoformat(),
        "event_start_time": random.choice([None, time(hour=random.randrange(13, 23), minute=random.randrange(0, 45, step = 15)).isoformat()]),
        "location_name": location_name,
        "location_address": f"{random.randrange(1, 50)} {random.choice(['rue', 'place', 'avenue', 'boulevard'])} {random.choice(['Saint Michel', 'Général de Gaulle', 'Du Printemps', 'Jérome'])}",
        "location_address_2": random.choice([None, None, None, "2ème étage", "Rez-de-chaussée", "Derrière le buisson"]),
        "location_address_code": location_address_code,
        "location_address_town": location_address_town,
        "price": price,
        "min_price": min_price,
        "max_price": max_price,
        "long_description": random.choice([None, f"This is a generated test event.\nBe Cool 😎.\nDon't panic 👌.\nParty hard 🖤.\nwww.github.com"]),
        "pending": pending,
        "phone": random.choice([None, "+33 6 01 12 13 14"]),
        "site_url": random.choice([None, "https://rcsculture.github.io"]),
        "to_eat": random.choice([True, False]),
        "min_age": min_age,
        "max_age": max_age,
        "tags": random.sample(TEST_TAGS, k=random.randint(0, min(3, len(TEST_TAGS)))) + ["is_test"],
        "image_url": SUPABASE_IMAGE_STORAGE + image
    }


def generate_events(n: int):
    events = []
    print("generate events...")
    events.append(format_event_payload(day_delta=0, category=["0", "1", "2"], title=f"Test Event #1.a", pending=False))
    events.append(format_event_payload(day_delta=0, category=["0"], title=f"Test Event #1.b", pending=False))
    events.append(format_event_payload(day_delta=0, category=["1"], title=f"Test Event #1.c", pending=False))
    events.append(format_event_payload(day_delta=0, category=["1"], title=f"Test Event #1.d", pending=False))
    events.append(format_event_payload(day_delta=0, category=["2"], title=f"Test Event #1.e", pending=False))
    events.append(format_event_payload(day_delta=0, category=["3"], title=f"Test Event #1.f", pending=False))
    events.append(format_event_payload(day_delta=0, category=["3"], title=f"Test Event #1.g", pending=False))
    events.append(format_event_payload(day_delta=0, category=["4"], title=f"Test Event #1.a", pending=False))
    events.append(format_event_payload(day_delta=0, category=["5"], title=f"Test Event #1.i", pending=False))
    for i in range(n):
        title = random.choice([f"This is a very very long Test Event #{i + 1} sdfsddsfs sdfg sdgs", f"Test Event #{i + 1}"])
        category = sorted(random.sample([str(c) for c in range(6)], k=random.randint(1, 6)))
        events.append(format_event_payload(day_delta=i, category=category, title=title, pending=random.choice([True, False, False, False])))
    return events


def generate_users(n: int):
    users = []
    print("generate users...")
    for i in range(n):
        role = random.randrange(2)
        if role == 0:
            official_request = random.choice([True, False])
            official_request_details = USER_OFFICIAL_REQUEST_DETAIL
        else:
            official_request = False
            official_request_details = ""

        user = {
            "email": f"{USER_EMAIL_PREFIX}{i}@rcs.tst",
            "name": f"{USER_NAME_PREFIX} {i}",
            "pwd": f"{USER_EMAIL_PREFIX}{i}",
            "role": role,
            "status": random.randrange(12),
            "official_request": official_request,
            "official_request_details": official_request_details
        }
        users.append(user)
    return users


def update_supabase_events(events: list):
    print("update 'events' table...")
    supabase_db: supabase.Client = supabase.create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, options=OPTIONS)
    for event in events:
        supabase_db.table("events").insert(event,).execute()


def update_supabase_users(users: list):
    print("update 'auth.users' table...")
    supabase_db: supabase.Client = supabase.create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, options=OPTIONS)
    for user in users:
        response = supabase_db.auth.admin.create_user(
            {
                "email": user["email"],
                "password": user["pwd"],
                "user_metadata": {"display_name": user["name"], "status": user["status"]},
            }
        )
        supabase_db.table("profiles").update(
            {
                "role": user["role"],
                "official_request": user["official_request"],
                "official_request_details": user["official_request_details"]
            }).eq("id", response.user.id).execute()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("-d", "--delete", action="store_true", help="delete only items and do not create (users or events)")
    subparsers = parser.add_subparsers(title="sub-commands", help="sub-command help")
    subparsers.required = True
    subparsers.dest = 'subcommand'

    event_parser = subparsers.add_parser("event", help="create test events")
    event_parser.add_argument("nb", type=int, help="number of test events to create (from today)")

    user_parser = subparsers.add_parser("user", help="create test users")
    user_parser.add_argument("nb", type=int, help="number of test users to create")

    args = parser.parse_args()
    
    if args.subcommand == "event":
        delete_events()
        if not args.delete:
            events = generate_events(args.nb)
            write_event_file(events)
            update_supabase_events(events)

    elif args.subcommand == "user":
        delete_users()
        if not args.delete:
            users = generate_users(args.nb)
            write_user_file(users)
            update_supabase_users(users)


if __name__ == "__main__":
    main()

