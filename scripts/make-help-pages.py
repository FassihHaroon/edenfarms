"""Generate faq.html, refund.html, terms.html, privacy.html for Eden Farm from one template."""
import re, os

# Regenerates faq/refund/terms/privacy.html. Edit the text below, then run: python scripts/make-help-pages.py
# (After changing English text, run `npm run i18n` to see which Arabic lines need updating.)
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
UPDATED = "5 October 2026"
PHONE = "+974 6643 1863"
WA = "https://wa.me/97466431863"
EMAIL = "info@edenfarm.qa"

PAGES = [
    ("faq.html", "FAQs"),
    ("refund.html", "Refunds & freshness"),
    ("terms.html", "Terms of service"),
    ("privacy.html", "Privacy policy"),
]

SPRITE = """<svg width="0" height="0" style="position:absolute" aria-hidden="true">
  <symbol id="i-pin" viewBox="0 0 24 24"><path d="M12 21s-6.5-6.2-6.5-11.2a6.5 6.5 0 0 1 13 0C18.5 14.8 12 21 12 21Z" fill="none" stroke="currentColor" stroke-width="1.9"/><circle cx="12" cy="9.8" r="2.3" fill="currentColor"/></symbol>
  <symbol id="i-phone" viewBox="0 0 24 24"><path d="M6.6 3.5h2.6l1.5 4-2 1.3a10.5 10.5 0 0 0 6.5 6.5l1.3-2 4 1.5v2.6a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.6 5.7a2 2 0 0 1 2-2.2Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></symbol>
  <symbol id="i-mail" viewBox="0 0 24 24"><rect x="3.5" y="5.5" width="17" height="13" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m4.5 7 7.5 6 7.5-6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></symbol>
  <symbol id="i-arrow" viewBox="0 0 24 24"><path d="M5 12h14m-5-5 5 5-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></symbol>
  <symbol id="i-wa" viewBox="0 0 24 24"><path d="M12 3a9 9 0 0 0-7.8 13.5L3 21l4.6-1.2A9 9 0 1 0 12 3Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M8.8 8.3c.2-.4.5-.4.8-.4h.5c.2 0 .4 0 .5.4l.7 1.7c.1.2 0 .4-.1.6l-.5.6c-.1.1-.2.3 0 .5.5.9 1.3 1.7 2.3 2.2.2.1.4.1.5-.1l.6-.7c.2-.2.4-.2.6-.1l1.6.8c.2.1.4.2.4.4 0 .6-.2 1.3-.8 1.7-.6.4-1.5.6-2.6.2a9 9 0 0 1-4.8-4.3c-.6-1.2-.4-2.3.3-3.1Z" fill="currentColor"/></symbol>
  <symbol id="i-ig" viewBox="0 0 24 24"><rect x="3.5" y="3.5" width="17" height="17" rx="5" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="17.2" cy="6.8" r="1.1" fill="currentColor"/></symbol>
  <symbol id="i-fb" viewBox="0 0 24 24"><path d="M14 8.5V7c0-.8.5-1.2 1.2-1.2H17V2.6h-2.6C11.7 2.6 10.6 4.4 10.6 7v1.5H8V12h2.6v9.4H14V12h2.6l.5-3.5Z" fill="currentColor"/></symbol>
</svg>"""


def page(file, title, meta_desc, eyebrow, h1, lede, toc, body):
    tabs = "\n".join(
        f'        <a href="{f}"{" class=\"is-on\" aria-current=\"page\"" if f == file else ""}>{label}</a>' for f, label in PAGES)
    toc_html = "\n".join(f'          <li><a href="#{i}">{t}</a></li>' for i, t in toc)
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{title} | Eden Farm Qatar</title>
<meta name="description" content="{meta_desc}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Young+Serif&family=Figtree:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400&display=swap">
<link rel="icon" type="image/png" href="assets/img/favicon.png">
<link rel="apple-touch-icon" href="assets/img/apple-touch-icon.png">
<link rel="stylesheet" href="css/styles.css">
</head>
<body class="page-sub">

<!-- Icon sprite -->
{SPRITE}

<!-- ============ HEADER ============ -->
<header class="header" id="top">
  <div class="wrap header__row header__row--sub">
    <a class="logo" href="index.html" aria-label="Eden Farm Qatar home">
      <img class="logo__img" src="assets/img/logo.avif" alt="Eden Farm · مزرعة عدن" width="542" height="168">
    </a>
    <div class="header__subacts">
      <a class="lang lang-switch" href="/ar/{file}" lang="ar">العربية</a>
      <a class="btn btn--primary header__shop" href="index.html#shop">Shop <svg class="ic"><use href="#i-arrow"/></svg></a>
    </div>
  </div>
  <nav class="catnav" aria-label="Help pages">
    <div class="wrap catnav__row">
{tabs}
      <a href="#contact">Contact</a>
    </div>
  </nav>
</header>

<main>

<section class="help-hero">
  <div class="wrap">
    <p class="eyebrow">{eyebrow}</p>
    <h1 class="help-hero__title">{h1}</h1>
    <p class="help-hero__lede">{lede}</p>
    <p class="help-hero__date">Last updated {UPDATED}</p>
  </div>
</section>

<section class="help">
  <div class="wrap help__grid">
    <aside class="help__side" aria-label="On this page">
      <nav class="help__toc">
        <p class="help__toc-h">On this page</p>
        <ol>
{toc_html}
        </ol>
      </nav>
    </aside>
    <div class="help__body">
{body}
    </div>
  </div>
</section>

<!-- ============ CONTACT ============ -->
<section class="contact-band" id="contact" aria-labelledby="contact-h">
  <div class="wrap">
    <h2 class="h2 h2--light" id="contact-h">Still have a question?</h2>
    <ul class="contact-list">
      <li><svg class="ic"><use href="#i-wa"/></svg><a href="{WA}" target="_blank" rel="noopener"><small>WhatsApp</small>{PHONE}</a></li>
      <li><svg class="ic"><use href="#i-phone"/></svg><a href="tel:+97466431863"><small>Phone</small>{PHONE}</a></li>
      <li><svg class="ic"><use href="#i-mail"/></svg><a href="mailto:{EMAIL}"><small>Email</small>{EMAIL}</a></li>
    </ul>
  </div>
</section>

</main>

<!-- ============ FOOTER ============ -->
<footer class="footer">
  <div class="wrap footer__grid">
    <div class="footer__brand">
      <a class="logo logo--light" href="index.html" aria-label="Eden Farm Qatar home">
        <img class="logo__img" src="assets/img/logo.avif" alt="Eden Farm · مزرعة عدن" width="542" height="168" loading="lazy">
      </a>
      <p>Home of Oryx Mushrooms. Farm-fresh mushrooms, vegetables, herbs and Sidr honey, grown in Qatar and delivered across Doha.</p>
      <div class="footer__social">
        <a href="https://www.instagram.com/edenfarmqatar" target="_blank" rel="noopener" aria-label="Instagram"><svg class="ic"><use href="#i-ig"/></svg></a>
        <a href="https://www.facebook.com/edenfarmqatar" target="_blank" rel="noopener" aria-label="Facebook"><svg class="ic"><use href="#i-fb"/></svg></a>
        <a href="{WA}" target="_blank" rel="noopener" aria-label="WhatsApp"><svg class="ic"><use href="#i-wa"/></svg></a>
      </div>
    </div>
    <div>
      <h3 class="footer__h">Shop</h3>
      <ul>
        <li><a href="index.html#mushrooms">Mushrooms</a></li>
        <li><a href="index.html#shop">Vegetables</a></li>
        <li><a href="index.html#shop">Fresh herbs</a></li>
        <li><a href="index.html#shop">Farm honey</a></li>
        <li><a href="index.html#boxes">Bundles</a></li>
      </ul>
    </div>
    <div>
      <h3 class="footer__h">Help</h3>
      <ul>
        <li><a href="faq.html">FAQs</a></li>
        <li><a href="faq.html#delivery">Delivery areas &amp; times</a></li>
        <li><a href="track.html">Track your order</a></li>
        <li><a href="refund.html">Freshness promise &amp; refunds</a></li>
        <li><a href="terms.html">Terms of service</a></li>
        <li><a href="privacy.html">Privacy policy</a></li>
        <li><a href="about.html">About us</a></li>
      </ul>
    </div>
    <div>
      <h3 class="footer__h">Get in touch</h3>
      <ul class="footer__contact">
        <li><small>Email</small><span>{EMAIL}</span></li>
        <li><small>Phone &amp; WhatsApp</small><span>{PHONE}</span></li>
        <li><small>Address</small><span>Doha, Qatar</span></li>
        <li><small>Deliveries</small><span id="delivery-hours">Daily, 8 am – 10 pm</span></li>
      </ul>
    </div>
  </div>
  <div class="wrap footer__base">
    <p>© 2026 Eden Farm Qatar. All rights reserved.</p>
  </div>
</footer>

<script src="/api/catalog.js"></script>
<script src="js/site.js"></script>
</body>
</html>
"""


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def sections(items):
    """items: list of (id, heading, html). Returns toc, body."""
    toc = [(i, h) for i, h, _ in items]
    body = "\n".join(f'      <section class="prose" id="{i}" aria-labelledby="{i}-h">\n        <h2 id="{i}-h">{h}</h2>\n{html}\n      </section>' for i, h, html in items)
    return toc, body


def faq_group(qas):
    out = []
    for q, a in qas:
        out.append(f'        <details class="faq" id="{slug(q)[:48]}">\n          <summary>{q}</summary>\n          <div class="faq__a">{a}</div>\n        </details>')
    return "\n".join(out)


link = lambda href, text: f'<a href="{href}">{text}</a>'
wa_link = f'<a href="{WA}" target="_blank" rel="noopener">WhatsApp ({PHONE})</a>'
mail_link = f'<a href="mailto:{EMAIL}">{EMAIL}</a>'

# ---------------------------------------------------------------- FAQ
faq_items = [
    ("ordering", "Ordering", faq_group([
        ("How do I place an order?",
         "<p>Add products to your basket, pick a delivery slot and tap <b>Checkout</b>. Enter your name, mobile number and address, choose how you'll pay the rider, then tap <b>Place order</b>. You'll see your order number (for example EF-1024) straight away.</p>"),
        ("Do I need to create an account?",
         "<p>No. All we need is a Qatar mobile number so we can confirm your order and the rider can reach you. Your delivery details are remembered on your own phone or computer, so next time is quicker.</p>"),
        ("Can I order on WhatsApp instead?",
         f"<p>Yes. Send us what you'd like and your address on {wa_link} and we'll take it from there.</p>"),
        ("How do I know my order has gone through?",
         "<p>A confirmation screen shows your order number as soon as you place it. We then call or WhatsApp you to confirm before delivery. If you haven't heard from us within a couple of hours during delivery times, message us with your order number.</p>"),
        ("Can I change or cancel my order?",
         "<p>Yes, free of charge, until it leaves the farm. Call or WhatsApp us with your order number. Once your order is out for delivery it can't be cancelled, but if anything is wrong when it arrives, our " + link("refund.html", "freshness promise") + " covers you.</p>"),
        ("Is there a minimum order?",
         "<p>If a minimum order applies, it's shown in your basket before you check out.</p>"),
    ])),
    ("delivery", "Delivery", faq_group([
        ("Where do you deliver?",
         "<p>Across Doha and nearby areas, including West Bay, The Pearl, Lusail, Al Sadd, Al Waab, Al Rayyan, Al Gharafa and Al Wakra.</p>"),
        ("How do I check if you deliver to me?",
         "<p>Tap <b>Deliver to</b> at the top of the shop (the pin button on phones). Use your current location, search for an area or landmark, or move the map until the pin is on your door. We tell you straight away if we deliver there.</p>"),
        ("Can I order for a different address?",
         "<p>Yes. Pick any location on the map, for example your office or a family member's home. We deliver to the pin you choose at checkout.</p>"),
        ("Can I track my order?",
         "<p>Yes. After you order, tap <b>Track your order</b> to follow it from confirmed to out for delivery to delivered. Once it's on the way, you'll see your rider's name and number. You can also find your order on our " + link("track.html", "tracking page") + " with your order number and mobile number.</p>"),
        ("When will my order arrive?",
         "<p>You choose a delivery slot in your basket. Orders placed before the same-day cutoff (shown at the top of the site, normally 2:00 pm) can arrive the same evening. Later orders go into tomorrow's slots. We deliver daily between 8 am and 10 pm.</p>"),
        ("How much does delivery cost?",
         "<p>The delivery fee is shown in your basket before you order. Orders above the free-delivery amount, shown at the top of the site and in your basket, are delivered free.</p>"),
        ("What if I'm not home?",
         "<p>The rider calls you when they're close. If we can't reach you, we'll agree another slot with you. Fresh produce can't be left outside in the heat, so please make sure someone can receive it.</p>"),
    ])),
    ("payment", "Payment", faq_group([
        ("How do I pay?",
         "<p>You pay the rider when your order arrives, by <b>cash</b>, <b>card</b> (the rider brings a card machine) or <b>bank transfer</b> (the rider shares our account details). Choose your method at checkout.</p>"),
        ("Can I pay online?",
         "<p>Not yet. Nothing is charged when you place an order on the website.</p>"),
        ("Will the price change after I order?",
         "<p>No. You pay the prices shown when you placed your order. If a price changes while you're shopping, your basket updates and shows the new total before you confirm.</p>"),
    ])),
    ("produce", "Our produce", faq_group([
        ("Where is your produce grown?",
         "<p>On our family farm in Qatar, where we've been farming since 2002. Our Oryx mushrooms are grown in our own growing rooms using Dutch technology, which we started in 2017. Each product shows its origin under its name.</p>"),
        ("Are your products certified?",
         "<p>Our mushroom house is HACCP certified and the farm holds ETKO organic certification. You can see both certificates on our " + link("about.html#certificates", "About page") + ".</p>"),
        ("How fresh is it?",
         "<p>We harvest in the morning, pack and chill by mid-morning, and deliver the same day or the next, so your produce has travelled kilometres, not continents.</p>"),
        ("Why does my pack weigh slightly differently from the label?",
         "<p>Fresh produce comes in natural sizes. We pack to the stated weight or count as closely as we can, and small differences are normal. Product photos show typical produce; yours will look a little different.</p>"),
        ("How should I store mushrooms?",
         "<p>Keep them in the fridge in their pack or a paper bag, not in a sealed plastic bag. Wipe or rinse them just before cooking, not before storing. They're at their best within 4 to 5 days.</p>"),
        ("My honey has gone thick or cloudy. Is it still good?",
         "<p>Yes. Pure honey naturally crystallises over time, especially when it's cool. Stand the jar in warm (not boiling) water to make it runny again. Store it at room temperature with the lid closed.</p>"),
    ])),
    ("bundles", "Bundles & repeat orders", faq_group([
        ("How do repeat orders work?",
         "<p>At checkout, choose how often you'd like the same basket again: every week, every 2 weeks, every month, or any number of days. We contact you before each delivery to confirm, and you pay the rider each time. To change, skip, pause or stop, message us at least one day before your next delivery.</p>"),
        ("Can I swap something in a bundle?",
         "<p>Bundles are packed from what's best that week. If you'd like a swap, add a note at checkout or message us and we'll do our best.</p>"),
    ])),
    ("help", "Problems & wholesale", faq_group([
        ("Something's wrong with my order. What do I do?",
         "<p>Message us within 24 hours of delivery with your order number and a photo, and we'll replace the item or refund you. Read our " + link("refund.html", "freshness promise &amp; refunds") + ".</p>"),
        ("Do you supply restaurants, hotels or shops?",
         f"<p>Yes. We supply supermarkets, restaurants, hotels and local markets. Email {mail_link} or call {PHONE} for wholesale prices.</p>"),
    ])),
]
toc, body = sections(faq_items)
faq_html = page("faq.html", "FAQs",
                "Answers about ordering, delivery across Doha, paying the rider, our mushrooms and produce, and subscriptions at Eden Farm Qatar.",
                "Help", "Frequently asked questions",
                "Ordering, delivery, payment and our produce. Can't find your answer? Message us on WhatsApp.",
                toc, body)

# ---------------------------------------------------------------- REFUND
refund_items = [
    ("promise", "Our freshness promise", """        <p>If anything in your order isn't fresh, arrives damaged, is missing, or isn't what you ordered, we'll replace it or refund it. You don't need to send anything back.</p>"""),
    ("check", "Check your order at the door", """        <p>You're welcome to check your order with the rider before you pay. If an item is clearly wrong or damaged, you can hand it back to the rider and you won't pay for it.</p>"""),
    ("report", "How to report a problem", f"""        <p>Contact us within <b>24 hours of delivery</b>, by {wa_link}, phone or {mail_link}, and tell us:</p>
        <ul>
          <li>your order number (for example EF-1024)</li>
          <li>which item is affected and what's wrong</li>
          <li>a photo of the item, if it's damaged or not fresh</li>
        </ul>
        <p>For missing items, just tell us what's missing.</p>"""),
    ("what-we-do", "Replacement or refund", """        <p>Once we've checked your report, usually the same day, you can choose:</p>
        <ul>
          <li><b>A replacement</b>, free of charge, with your next delivery or in a separate delivery as soon as we can</li>
          <li><b>A refund</b> for the affected items</li>
          <li><b>Credit</b> towards your next order</li>
        </ul>
        <p>If your whole order was affected, we also refund the delivery fee.</p>"""),
    ("how-refunds", "How refunds are paid", """        <p>As you paid the rider on delivery, we refund in the way that suits you:</p>
        <ul>
          <li><b>Cash</b>: handed back by the rider on your next delivery</li>
          <li><b>Bank transfer</b>: to the account you give us</li>
          <li><b>Card</b>: back to the card you paid with, where our card machine allows it</li>
        </ul>
        <p>We send bank and card refunds within 7 days of approving them. Your bank may take a few more days to show the money.</p>"""),
    ("returns", "Returns", """        <p>Our products are fresh, perishable food, so we can't accept returns of items that were in good condition on delivery, or of produce that has been stored, opened or used. This doesn't affect your rights if something was wrong with your order.</p>"""),
    ("cancel", "Cancelling an order", """        <p>You can cancel free of charge until your order leaves the farm: call or WhatsApp us with your order number. Once your order is out for delivery, it can't be cancelled. If you won't be home, tell us and we'll move it to another slot.</p>"""),
    ("subscriptions", "Repeat orders", """        <p>Repeat orders can be changed, skipped, paused or cancelled at any time, with no fee. Message us at least one day before your next delivery.</p>"""),
    ("charges", "Wrong charges", """        <p>If you think you were charged the wrong amount, contact us with your order number and we'll put it right.</p>"""),
]
toc, body = sections(refund_items)
refund_html = page("refund.html", "Freshness promise & refunds",
                   "Eden Farm Qatar's freshness promise: if anything is not fresh, damaged, missing or wrong, we replace or refund it. How to report a problem and how refunds are paid.",
                   "Help", "Freshness promise &amp; refunds",
                   "Fresh food should arrive fresh. If it doesn't, here's how we put it right.",
                   toc, body)

# ---------------------------------------------------------------- TERMS
terms_items = [
    ("about", "About these terms", f"""        <p>These terms apply when you use edenfarm.qa or order from Eden Farm ("we", "us"), a farm in Doha, Qatar. By placing an order, you agree to them. Please read them together with our {link("refund.html", "freshness promise &amp; refunds")} and {link("privacy.html", "privacy policy")}.</p>"""),
    ("orders", "Orders", """        <ul>
          <li>You must be 18 or older, or have permission from a parent or guardian, to place an order.</li>
          <li>When you place an order, you receive an order number. Your order is confirmed when we call or message you.</li>
          <li>We may decline or cancel an order, for example if we don't deliver to your area, a product is unavailable, a price was shown in error, or the order looks fraudulent. If we do, we'll tell you, and you won't pay anything.</li>
          <li>If an item you ordered isn't available on the day, we'll contact you to offer a substitute or remove it and lower your total.</li>
        </ul>"""),
    ("products", "Our products", """        <p>Our produce is grown naturally, so size, shape and colour vary. Photos show typical produce and are for illustration. Weights and counts are packed as closely as we can to the label, and small differences are normal. What we have depends on the harvest.</p>"""),
    ("prices", "Prices and payment", """        <ul>
          <li>Prices are in Qatari riyals (QAR). You pay the prices shown when you placed your order.</li>
          <li>The delivery fee, any free-delivery amount and any minimum order are shown in your basket before you order.</li>
          <li>You pay the rider on delivery by cash, card or bank transfer. For bank transfers, please complete the transfer when the rider arrives, or as agreed with us.</li>
          <li>We don't take payment on the website.</li>
        </ul>"""),
    ("delivery", "Delivery", """        <ul>
          <li>Delivery slots are time windows, not exact times. Traffic or weather can sometimes cause delays, and we'll keep you informed.</li>
          <li>Please set your delivery pin accurately, give a correct address and mobile number, and make sure someone can receive the order. If we can't reach you, we'll arrange another slot.</li>
          <li>We only deliver inside our delivery areas. The location check on the website shows whether we can reach a location.</li>
          <li>Responsibility for the order passes to you once it has been handed over.</li>
        </ul>"""),
    ("subscriptions", "Repeat orders", """        <p>If you choose to repeat your order, we prepare the same basket again after the number of days you chose, until you pause or cancel. Each delivery is charged at the prices on the day it's prepared, and we confirm with you before each one. You can change, skip, pause or cancel at any time by messaging us at least one day before your next delivery.</p>"""),
    ("problems", "If something goes wrong", f"""        <p>Our {link("refund.html", "freshness promise")} explains how we replace or refund items that aren't fresh, are damaged, missing or wrong.</p>"""),
    ("use", "Using our website", """        <p>Please don't place fake orders, misuse the website, try to access areas that aren't meant for customers, or copy our content for commercial use.</p>"""),
    ("ip", "Our name and content", """        <p>The Eden Farm and Oryx Mushrooms names, logos, photos and text on this website belong to Eden Farm. You can share links to our pages, but please don't reuse our content without permission.</p>"""),
    ("liability", "Our responsibility to you", """        <p>We're responsible for loss or damage you suffer that is a foreseeable result of us breaking these terms or not taking reasonable care. We're not responsible for losses that weren't foreseeable, or for business losses. Our responsibility for any order is limited to the value of that order. Nothing in these terms limits any rights you have under the laws of Qatar that can't be limited.</p>"""),
    ("changes", "Changes to these terms", """        <p>We may update these terms from time to time. The version on this page when you place an order is the one that applies to that order.</p>"""),
    ("law", "Governing law", """        <p>These terms are governed by the laws of the State of Qatar, and the courts of Qatar deal with any dispute.</p>"""),
    ("contact-us", "Contact us", f"""        <p>Questions about these terms? Contact us by {wa_link}, phone or {mail_link}.</p>"""),
]
toc, body = sections(terms_items)
terms_html = page("terms.html", "Terms of service",
                  "The terms for ordering from Eden Farm Qatar: orders, prices, paying the rider on delivery, delivery slots, subscriptions and your rights.",
                  "Help", "Terms of service",
                  "The plain-English terms for ordering from Eden Farm.",
                  toc, body)

# ---------------------------------------------------------------- PRIVACY
privacy_items = [
    ("who", "Who we are", f"""        <p>Eden Farm is a farm in Doha, Qatar. This policy explains what personal information we collect through edenfarm.qa and when you order from us, and how we use it. For any privacy question, email {mail_link}.</p>"""),
    ("collect", "What we collect", """        <p><b>When you order:</b> your name, mobile number, delivery location (the map pin you choose) and address (area, zone, street, building and any directions), what you ordered, your delivery slot, how often you'd like it repeated, how you plan to pay the rider, and any notes you add.</p>
        <p><b>When you check delivery:</b> if you tap <b>Use my current location</b>, your phone shares its location with the website once, after asking your permission. We use it only to check whether we deliver there and to place your pin. We don't track your location.</p>
        <p><b>When you contact us:</b> your messages and the details you share with us.</p>
        <p><b>For security:</b> our server keeps a one-way coded version of your internet (IP) address with each order, to stop spam orders, plus standard server logs that are kept for a short time.</p>
        <p>We don't take card details on the website, we don't use advertising or tracking cookies, and customers don't need an account or password.</p>"""),
    ("device", "Stored on your own device", """        <p>To save you time, your basket, favourites, delivery location, delivery details and recent order numbers are stored in your browser on your own phone or computer. They aren't sent to us until you place an order. You can remove them at any time by clearing your browser's site data.</p>"""),
    ("use", "How we use your information", """        <ul>
          <li>to prepare and deliver your order, and contact you about it by phone, SMS or WhatsApp</li>
          <li>to handle replacements, refunds and questions</li>
          <li>to prepare repeat orders, if you asked for them</li>
          <li>to prevent fraud and spam orders</li>
          <li>to keep the business records the law requires</li>
        </ul>
        <p>We never sell your personal information.</p>"""),
    ("share", "Who we share it with", """        <ul>
          <li><b>Our delivery riders</b>, who see your name, mobile number, address and order so they can deliver it</li>
          <li><b>Companies that host our website and database</b>, which store information for us and may only use it on our instructions</li>
          <li><b>Google Fonts</b>: our pages load fonts from Google, which receives your IP address when the page loads</li>
          <li><b>OpenStreetMap</b>: our map and address search use OpenStreetMap services, which receive your IP address and the places you search for or view on the map</li>
          <li><b>WhatsApp (Meta)</b>, when you choose to message us there</li>
          <li><b>Authorities</b>, if the law requires us to</li>
        </ul>"""),
    ("keep", "How long we keep it", """        <ul>
          <li>Order records: for as long as we need them for deliveries, customer service, and the record-keeping that Qatari law requires</li>
          <li>Server logs: a short time, for security</li>
        </ul>"""),
    ("security", "Keeping it safe", """        <p>Our website uses an encrypted connection (HTTPS). Only authorised Eden Farm staff can see orders, and they sign in with a password. No system is completely secure, but we take reasonable steps to protect your information.</p>"""),
    ("rights", "Your rights", f"""        <p>Under Qatar's personal data protection law (Law No. 13 of 2016), you can ask us to show you the information we hold about you, correct it, delete it, or stop using it for marketing. Email {mail_link} and we'll reply within 30 days.</p>"""),
    ("children", "Children", """        <p>Our website isn't intended for children under 18, and we don't knowingly collect their information.</p>"""),
    ("changes", "Changes to this policy", """        <p>If we change this policy, we'll update it on this page with a new date.</p>"""),
    ("contact-us", "Contact us", f"""        <p>Questions or concerns about your privacy? Email {mail_link} or message us on {wa_link}.</p>"""),
]
toc, body = sections(privacy_items)
privacy_html = page("privacy.html", "Privacy policy",
                    "How Eden Farm Qatar collects, uses and protects your personal information when you order from us or visit edenfarm.qa.",
                    "Help", "Privacy policy",
                    "What we collect when you order, why, and the choices you have.",
                    toc, body)

for name, html in [("faq.html", faq_html), ("refund.html", refund_html), ("terms.html", terms_html), ("privacy.html", privacy_html)]:
    with open(os.path.join(ROOT, name), "w", encoding="utf-8") as f:
        f.write(html)
    print(name, len(html))
