/*
 *           DO WHAT THE FUCK YOU WANT TO PUBLIC LICENSE
 *                   Version 2, December 2004
 *
 *           DO WHAT THE FUCK YOU WANT TO PUBLIC LICENSE
 *  TERMS AND CONDITIONS FOR COPYING, DISTRIBUTION AND MODIFICATION
 *
 *  0. You just DO WHAT THE FUCK YOU WANT TO.
 *********************************************************************/

const { classes: Cc, interfaces: Ci, results: Cr, utils: Cu } = Components;

var Spoofer = (function () {
	var c = function () {};

	var Observer              = Cc["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService),
	    NetworkIO             = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService),
	    ScriptSecurityManager = Cc["@mozilla.org/scriptsecuritymanager;1"].getService(Ci.nsIScriptSecurityManager),
	    EffectiveTLDService   = Cc["@mozilla.org/network/effective-tld-service;1"].getService(Ci.nsIEffectiveTLDService),
	    Preferences           = Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefService).getBranch("extensions.smart-referer."),
	    DefaultPreferences    = Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefService).getDefaultBranch("extensions.smart-referer.");

	Preferences.QueryInterface(Ci.nsIPrefBranch2);

	DefaultPreferences.setBoolPref("strict", false);
	DefaultPreferences.setCharPref("mode", "self");
	DefaultPreferences.setCharPref("referer", "");
	DefaultPreferences.setCharPref("whitelist.to", "");
	DefaultPreferences.setCharPref("whitelist.from", "");

	function toRegexpArray (string) {
		return string.split(/[;,\s]+/).map(function (s) {
			if (s == 0) {
				return null;
			}

			try {
				return new RegExp(s);
			}
			catch (e) {
				return null;
			}
		}).filter(function (s) { return s; });
	}

	var whitelist = {
		to:   toRegexpArray(Preferences.getCharPref("whitelist.to")),
		from: toRegexpArray(Preferences.getCharPref("whitelist.from"))
	};

	function can (what, domain) {
		var list = whitelist[what == "receive" ? "to" : "from"];

		for (var i = 0; i < list.length; i++) {
			if (domain.match(list[i])) {
				return true;
			}
		}

		return false;
	}

	c.prototype.observe = function (subject, topic, data) {
		if (topic == "http-on-modify-request") {
			var http = subject.QueryInterface(Ci.nsIHttpChannel),
			    referer;

			try {
				referer = NetworkIO.newURI(http.getRequestHeader("Referer"), null, null);
			}
			catch (e) {
				return false;
			}

			try {
				var toURI   = http.URI.clone(),
						fromURI = referer.clone();

				if (fromURI.host == toURI.host || can("send", fromURI.host) || can("receive", toURI.host)) {
					return false;
				}

				try {
					var isIP = false;

					EffectiveTLDService.getPublicSuffix(fromURI);
					EffectiveTLDService.getPublicSuffix(toURI);
				}
				catch (e) {
					if (e == Cr.NS_ERROR_HOST_IS_IP_ADDRESS) {
						isIP = true;
					}
				}

				if (!isIP) {
					if (!Preferences.getBoolPref("strict")) {
						let [from, to] = [fromURI, toURI].map(function (x) x.host.split('.').reverse());
						let index      = 0;

						while (from[index] || to[index]) {
							if (from[index] == to[index]) {
								index++;
							}
							else {
								from.splice(index);
								to.splice(index);
							}
						}

						if (from.length == 0) {
							throw Cr.NS_ERROR_DOM_BAD_URI;
						}

						fromURI.host = from.reverse().join('.');
						toURI.host   = to.reverse().join('.');
					}

					try {
						if (EffectiveTLDService.getPublicSuffix(fromURI) == fromURI.host) {
							throw Cr.NS_ERROR_DOM_BAD_URI;
						}
					}
					catch (e) {
						if (e == Cr.NS_ERROR_DOM_BAD_URI) {
							throw e;
						}
					}
				}

				ScriptSecurityManager.checkSameOriginURI(fromURI, toURI, false);

				return false;
			}
			catch (e) {
				var mode = Preferences.getCharPref("mode").trim();

				if (mode == "direct") {
					referer = null;
				}
				else if (mode == "self") {
					referer = http.URI;
				}
				else {
					referer = Preferences.getCharPref("referer");
				}

				if (typeof(referer) === "string") {
					http.setRequestHeader("Referer", referer, false);
				}
				else {
					http.referrer = referer;
				}

				return true;
			}
		}
		else if (topic == "nsPref:changed") {
			if (data == "whitelist.to") {
				whitelist.to = toRegexpArray(Preferences.getCharPref("whitelist.to"));
			}
			else if (data == "whitelist.from") {
				whitelist.from = toRegexpArray(Preferences.getCharPref("whitelist.from"));
			}
		}
	}

	c.prototype.start = function () {
		Observer.addObserver(this, "http-on-modify-request", false);

		Preferences.addObserver("whitelist.to", this, false);
		Preferences.addObserver("whitelist.from", this, false);
	}

	c.prototype.stop = function () {
		Observer.removeObserver(this, "http-on-modify-request");

		Preferences.removeObserver("whitelist.to", this);
		Preferences.removeObserver("whitelist.from", this);
	}

	return c;
})();

var spoofer;

function startup (data, reason) {
	spoofer = new Spoofer();
	spoofer.start();
}

function shutdown (data, reason) {
	spoofer.stop();
}
