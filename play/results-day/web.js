// In a browser tab there is no window to close: Quit goes back to the site.
window.close = function () { window.location.href = "../../#demo"; };
