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

  // Payment links, shown as "Already agreed a plan? Pay here". A link left as "" hides its button.
  etsyUrl: "",                        // your Etsy listing, e.g. "https://www.etsy.com/listing/..."
  paypalUrl: "",                      // your PayPal.me or payment link, e.g. "https://www.paypal.com/paypalme/yourname"

  turnaround: "1–3 days",             // after the customer has approved the plan
  prices: {
    standard: 40,                     // US dollars
    deluxe: 60,
    audio: 20,                        // the optional voice-over and music add-on, on top of either size
  },
  year: 2026,
};
