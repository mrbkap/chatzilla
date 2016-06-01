/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var EXPORTED_SYMBOLS = [
  "ChatzillaProtocols",
  "IRCProtocolHandlerFactory",
  "IRCSProtocolHandlerFactory",
  "IRCPROT_HANDLER_CID",
  "IRCSPROT_HANDLER_CID"
];

const { classes: Cc, interfaces: Ci } = Components;

const STANDARDURL_CONTRACTID =
    "@mozilla.org/network/standard-url;1";
const IOSERVICE_CONTRACTID =
    "@mozilla.org/network/io-service;1";

const IRCPROT_HANDLER_CONTRACTID =
    "@mozilla.org/network/protocol;1?name=irc";
const IRCSPROT_HANDLER_CONTRACTID =
    "@mozilla.org/network/protocol;1?name=ircs";
const IRCPROT_HANDLER_CID =
    Components.ID("{f21c35f4-1dd1-11b2-a503-9bf8a539ea39}");
const IRCSPROT_HANDLER_CID =
    Components.ID("{f21c35f4-1dd1-11b2-a503-9bf8a539ea3a}");

const IRC_MIMETYPE = "application/x-irc";
const IRCS_MIMETYPE = "application/x-ircs";

const nsIProtocolHandler = Ci.nsIProtocolHandler;
const nsIStandardURL     = Ci.nsIStandardURL;
const nsIChannel         = Ci.nsIChannel;
const nsIRequest         = Ci.nsIRequest;
const nsIIOService       = Ci.nsIIOService;
const nsISupports        = Ci.nsISupports;
const nsIURI             = Ci.nsIURI;

//XXXgijs: Because necko is annoying and doesn't expose this error flag, we
//         define our own constant for it. Throwing something else will show
//         ugly errors instead of seeminly doing nothing.
const NS_ERROR_MODULE_NETWORK_BASE = 0x804b0000;
const NS_ERROR_NO_CONTENT = NS_ERROR_MODULE_NETWORK_BASE + 17;

/* irc protocol handler component */
function IRCProtocolHandler(isSecure)
{
    this.isSecure = isSecure;
}

IRCProtocolHandler.prototype.protocolFlags =
                   nsIProtocolHandler.URI_NORELATIVE |
                   nsIProtocolHandler.ALLOWS_PROXY;
if ("URI_DANGEROUS_TO_LOAD" in nsIProtocolHandler) {
  IRCProtocolHandler.prototype.protocolFlags |=
      nsIProtocolHandler.URI_LOADABLE_BY_ANYONE;
}
if ("URI_NON_PERSISTABLE" in nsIProtocolHandler) {
  IRCProtocolHandler.prototype.protocolFlags |=
      nsIProtocolHandler.URI_NON_PERSISTABLE;
}
if ("URI_DOES_NOT_RETURN_DATA" in nsIProtocolHandler) {
  IRCProtocolHandler.prototype.protocolFlags |=
      nsIProtocolHandler.URI_DOES_NOT_RETURN_DATA;
}

function spawnChatZilla(uri) {
  var cpmm = Cc["@mozilla.org/childprocessmessagemanager;1"]
               .getService(Ci.nsISyncMessageSender);
  cpmm.sendAsyncMessage("Chatzilla:SpawnChatzilla", { uri });
}

IRCProtocolHandler.prototype.allowPort =
function ircph_allowPort(port, scheme)
{
    return false;
}

IRCProtocolHandler.prototype.newURI =
function ircph_newURI(spec, charset, baseURI)
{
    var cls = Components.classes[STANDARDURL_CONTRACTID];
    var url = cls.createInstance(nsIStandardURL);
    url.init(nsIStandardURL.URLTYPE_STANDARD, (this.isSecure ? 9999 : 6667), spec, charset, baseURI);

    return url.QueryInterface(nsIURI);
}

IRCProtocolHandler.prototype.newChannel =
function ircph_newChannel(URI)
{
    var ios = Components.classes[IOSERVICE_CONTRACTID].getService(nsIIOService);
    if (!ios.allowPort(URI.port, URI.scheme))
        throw Components.results.NS_ERROR_FAILURE;

    return new BogusChannel(URI, this.isSecure);
}

/* protocol handler factory object (IRCProtocolHandler) */
var IRCProtocolHandlerFactory = new Object();

IRCProtocolHandlerFactory.createInstance =
function ircphf_createInstance(outer, iid)
{
    if (outer != null)
        throw Components.results.NS_ERROR_NO_AGGREGATION;

    if (!iid.equals(nsIProtocolHandler) && !iid.equals(nsISupports))
        throw Components.results.NS_ERROR_INVALID_ARG;

    var protHandler = new IRCProtocolHandler(false);
    protHandler.scheme = "irc";
    protHandler.defaultPort = 6667;
    return protHandler;
}

/* secure protocol handler factory object (IRCProtocolHandler) */
var IRCSProtocolHandlerFactory = new Object();

IRCSProtocolHandlerFactory.createInstance =
function ircphf_createInstance(outer, iid)
{
    if (outer != null)
        throw Components.results.NS_ERROR_NO_AGGREGATION;

    if (!iid.equals(nsIProtocolHandler) && !iid.equals(nsISupports))
        throw Components.results.NS_ERROR_INVALID_ARG;

    var protHandler = new IRCProtocolHandler(true);
    protHandler.scheme = "ircs";
    protHandler.defaultPort = 9999;
    return protHandler;
}

/* bogus IRC channel used by the IRCProtocolHandler */
function BogusChannel(URI, isSecure)
{
    this.URI = URI;
    this.originalURI = URI;
    this.isSecure = isSecure;
    this.contentType = (this.isSecure ? IRCS_MIMETYPE : IRC_MIMETYPE);
}

BogusChannel.prototype.QueryInterface =
function bc_QueryInterface(iid)
{
    if (!iid.equals(nsIChannel) && !iid.equals(nsIRequest) &&
        !iid.equals(nsISupports))
        throw Components.results.NS_ERROR_NO_INTERFACE;

    return this;
}

/* nsIChannel */
BogusChannel.prototype.loadAttributes = null;
BogusChannel.prototype.contentLength = 0;
BogusChannel.prototype.owner = null;
BogusChannel.prototype.loadGroup = null;
BogusChannel.prototype.notificationCallbacks = null;
BogusChannel.prototype.securityInfo = null;

BogusChannel.prototype.open =
BogusChannel.prototype.asyncOpen =
function bc_open(observer, ctxt)
{
    spawnChatZilla(this.URI.spec);
    // We don't throw this (a number, not a real 'resultcode') because it
    // upsets xpconnect if we do (error in the js console).
    Components.returnCode = NS_ERROR_NO_CONTENT;
}

BogusChannel.prototype.asyncRead =
function bc_asyncRead(listener, ctxt)
{
    throw Components.results.NS_ERROR_NOT_IMPLEMENTED;
}

/* nsIRequest */
BogusChannel.prototype.isPending =
function bc_isPending()
{
    return true;
}

BogusChannel.prototype.status = Components.results.NS_OK;

BogusChannel.prototype.cancel =
function bc_cancel(status)
{
    this.status = status;
}

BogusChannel.prototype.suspend =
BogusChannel.prototype.resume =
function bc_suspres()
{
    throw Components.results.NS_ERROR_NOT_IMPLEMENTED;
}


ChatzillaProtocols = {
  init() {
    let compMgr = Components.manager.QueryInterface(Ci.nsIComponentRegistrar);
    compMgr.registerFactory(IRCPROT_HANDLER_CID, "IRC protocol handler",
                            IRCPROT_HANDLER_CONTRACTID,
                            IRCProtocolHandlerFactory);
    compMgr.registerFactory(IRCSPROT_HANDLER_CID, "IRC protocol handler",
                            IRCSPROT_HANDLER_CONTRACTID,
                            IRCSProtocolHandlerFactory);
  },

  initObsolete(compMgr, fileSepc, location, type) {
    compMgr = compMgr.QueryInterface(Components.interfaces.nsIComponentRegistrar);

    compMgr.registerFactoryLocation(IRCPROT_HANDLER_CID,
                                    "IRC protocol handler",
                                    IRCPROT_HANDLER_CONTRACTID,
                                    fileSpec, location, type);

    debug("*** Registering ircs protocol handler.\n");
    compMgr.registerFactoryLocation(IRCSPROT_HANDLER_CID,
                                    "IRCS protocol handler",
                                    IRCSPROT_HANDLER_CONTRACTID,
                                    fileSpec, location, type);

  },
};
