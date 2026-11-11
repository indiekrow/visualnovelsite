// The site's settings: the only file you need to edit. Save it and re-upload the folder.
window.SITE = {
  brand: "visualnovels.ai",           // shown at the top and in the browser tab
  tagline: "Bring your story to life as a game you can play.",

  // How the idea form ("Bring your story to life") reaches you:
  //   "netlify": sent through Netlify Forms (free; works once the site is hosted on Netlify)
  //   "email":   opens the visitor's own email app with their answers filled in (needs contactEmail)
  //   "off":     hides the form
  ideaForm: "email",                  // GitHub Pages has no form service; with contactEmail empty the form stays hidden
  contactEmail: "",                   // also the fallback if the form can't send, and the contact link in the footer

  // Payment links, shown beside the form as "Ready to order?". A link left as "" hides its button.
  etsyUrl: "",                        // your Etsy listing, e.g. "https://www.etsy.com/listing/..."
  paypalUrl: "",                      // your PayPal.me or payment link, e.g. "https://www.paypal.com/paypalme/yourname"

  turnaround: "1–3 days",             // after the customer has approved the plan
  // Orders are paid up front. What a customer gets back if they stop after seeing the story plan, in words that fit
  // "you get ...": for example "half your money back" or "a 50% refund".
  planRefund: "a partial refund",
  prices: {
    standard: 20,                     // US dollars
    deluxe: 35,
    audio: 20,                        // the optional voice-over and music add-on, on top of any size
  },
  // A launch offer: the regular prices are shown crossed out beside the prices above, labelled with offerLabel.
  // Only show a regular price you really will charge once the offer ends. Remove regularPrices to turn it off.
  regularPrices: {
    standard: 40,
    deluxe: 70,
  },
  offerLabel: "Launch price",
  year: 2026,
};
