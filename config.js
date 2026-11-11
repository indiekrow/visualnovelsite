// The site's settings: the only file you need to edit. Save it and re-upload the folder.
window.SITE = {
  brand: "GoodEndGames",              // shown at the top and in the browser tab
  tagline: "Bring your story to life as a game you can play.",

  // How the idea form ("Bring your story to life") reaches you:
  //   "netlify": sent through Netlify Forms (free; works once the site is hosted on Netlify)
  //   "email":   opens the visitor's own email app with their answers filled in (needs contactEmail)
  //   "off":     hides the form
  ideaForm: "email",                  // GitHub Pages has no form service; with contactEmail empty the form stays hidden
  contactEmail: "",                   // also the fallback if the form can't send, and the contact link in the footer

  // Where orders are placed: your Ko-fi commissions link. While the idea form is hidden, the page sends people there
  // to order and to describe their idea. "" switches it off.
  kofiOrderUrl: "https://ko-fi.com/goodendgames/commissions",

  // Other payment links, shown as buttons after the Ko-fi one. A link left as "" hides its button.
  etsyUrl: "",                        // your Etsy listing, e.g. "https://www.etsy.com/listing/..."
  paypalUrl: "",                      // your PayPal.me or payment link, e.g. "https://www.paypal.com/paypalme/yourname"

  // Your Ko-fi page, shown as "Support on Ko-fi" in the footer. It is for tips, not orders. "" hides the link.
  kofiUrl: "https://ko-fi.com/goodendgames",

  turnaround: "3 days",               // after the customer has approved the plan
  priorityTurnaround: "1 day",        // the same, with the priority add-on (prices.priority)
  // Orders are paid up front. What a customer gets back if they stop after seeing the story plan, in words that fit
  // "you get ...": for example "half your money back" or "a 50% refund".
  planRefund: "half your money back",
  currency: "€",                      // the sign shown before every price; the Ko-fi listings charge in euros
  prices: {
    standard: 20,                     // must match the Ko-fi listings
    deluxe: 35,
    priority: 10,                     // the priority add-on: ready in priorityTurnaround instead of turnaround
    audio: 20,                       // the voice-over and music add-on; the page says it is coming soon
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
