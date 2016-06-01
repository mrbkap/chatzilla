/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * This file contains the following chatzilla related components:
 * 1. Command line handler service, for responding to the -chat command line
 *    option. (CLineHandler)
 * 2. Content handlers for responding to content of type x-application-irc[s]
 *    (IRCContentHandler)
 * 3. Protocol handler for supplying a channel to the browser when an irc://
 *    or ircs:// link is clicked. (IRCProtocolHandler)
 * 4. A (nearly empty) implementation of nsIChannel for telling the browser
 *    that irc:// links have the content type x-application-irc[s] (BogusChannel)
 */

/* components defined in this file */
const CLINE_SERVICE_CONTRACTID =
    "@mozilla.org/commandlinehandler/general-startup;1?type=chat";
const CLINE_SERVICE_CID =
    Components.ID("{38a95514-1dd2-11b2-97e7-9da958640f2c}");
const STARTUP_CID =
    Components.ID("{ae6ad015-433b-42ab-9afc-1636af5a7fc4}");

/* components used in this file */
const MEDIATOR_CONTRACTID =
    "@mozilla.org/appshell/window-mediator;1";
const ASS_CONTRACTID =
    "@mozilla.org/appshell/appShellService;1";
const RDFS_CONTRACTID =
    "@mozilla.org/rdf/rdf-service;1";

/* interfaces used in this file */
const nsIWindowMediator  = Components.interfaces.nsIWindowMediator;
const nsICategoryManager = Components.interfaces.nsICategoryManager;
const nsIURIContentListener = Components.interfaces.nsIURIContentListener;
const nsIURILoader       = Components.interfaces.nsIURILoader;
const nsIAppShellService = Components.interfaces.nsIAppShellService;
const nsISupports        = Components.interfaces.nsISupports;
const nsISupportsWeakReference = Components.interfaces.nsISupportsWeakReference;
const nsIRDFService      = Components.interfaces.nsIRDFService;
const nsICommandLineHandler = Components.interfaces.nsICommandLineHandler;
const nsICommandLine     = Components.interfaces.nsICommandLine;

Components.utils.import("chrome://chatzilla/content/lib/js/ProtocolHandlers.jsm");

// ChatZilla launcher method
function spawnChatZilla(uri, count)
{
    var e;

    var wmClass = Components.classes[MEDIATOR_CONTRACTID];
    var windowManager = wmClass.getService(nsIWindowMediator);

    var assClass = Components.classes[ASS_CONTRACTID];
    var ass = assClass.getService(nsIAppShellService);
    hiddenWin = ass.hiddenDOMWindow;

    // Ok, not starting currently, so check if we've got existing windows.
    var w = windowManager.getMostRecentWindow("irc:chatzilla");

    // Claiming that a ChatZilla window is loading.
    if ("ChatZillaStarting" in hiddenWin)
    {
        dump("cz-service: ChatZilla claiming to be starting.\n");
        if (w && ("client" in w) && ("initialized" in w.client) &&
            w.client.initialized)
        {
            dump("cz-service: It lied. It's finished starting.\n");
            // It's actually loaded ok.
            delete hiddenWin.ChatZillaStarting;
        }
    }

    if ("ChatZillaStarting" in hiddenWin)
    {
        count = count || 0;

        if ((new Date() - hiddenWin.ChatZillaStarting) > 10000)
        {
            dump("cz-service: Continuing to be unable to talk to existing window!\n");
        }
        else
        {
            //dump("cz-service: **** Try: " + count + ", delay: " + (new Date() - hiddenWin.ChatZillaStarting) + "\n");

            // We have a ChatZilla window, but we're still loading.
            hiddenWin.setTimeout(function wrapper(count) {
                    spawnChatZilla(uri, count + 1);
                }, 250, count);
            return true;
        }
    }

    // We have a window.
    if (w)
    {
        dump("cz-service: Existing, fully loaded window. Using.\n");
        // Window is working and initialized ok. Use it.
        w.focus();
        if (uri)
            w.gotoIRCURL(uri);
        return true;
    }

    dump("cz-service: No windows, starting new one.\n");
    // Ok, no available window, loading or otherwise, so start ChatZilla.
    var args = new Object();
    if (uri)
        args.url = uri;

    hiddenWin.ChatZillaStarting = new Date();
    hiddenWin.openDialog("chrome://chatzilla/content/chatzilla.xul", "_blank",
                 "chrome,menubar,toolbar,status,resizable,dialog=no",
                 args);

    return true;
}


/* Command Line handler service */
function CLineService()
{}

/* nsISupports */
CLineService.prototype.QueryInterface =
function handler_QI(iid)
{
    if (iid.equals(nsISupports))
        return this;

    if (nsICommandLineHandler && iid.equals(nsICommandLineHandler))
        return this;

    throw Components.results.NS_ERROR_NO_INTERFACE;
}

/* nsICommandLineHandler */
CLineService.prototype.handle =
function handler_handle(cmdLine)
{
    var uri;
    try
    {
        uri = cmdLine.handleFlagWithParam("chat", false);
    }
    catch (e)
    {
    }

    if (uri || cmdLine.handleFlag("chat", false))
    {
        spawnChatZilla(uri || null)
        cmdLine.preventDefault = true;
    }
}

CLineService.prototype.helpInfo =
 "  -chat [<ircurl>]  Start with an IRC chat client.\n"

/* factory for command line handler service (CLineService) */
var CLineFactory = new Object();

CLineFactory.createInstance =
function (outer, iid)
{
    if (outer != null)
        throw Components.results.NS_ERROR_NO_AGGREGATION;

    return new CLineService().QueryInterface(iid);
}

var ChatzillaModule = new Object();

ChatzillaModule.registerSelf =
function cz_mod_registerSelf(compMgr, fileSpec, location, type)
{
    compMgr = compMgr.QueryInterface(Components.interfaces.nsIComponentRegistrar);
    var catman = Components.classes["@mozilla.org/categorymanager;1"]
        .getService(nsICategoryManager);

    debug("*** Registering -chat handler.\n");
    compMgr.registerFactoryLocation(CLINE_SERVICE_CID,
                                    "Chatzilla CommandLine Service",
                                    CLINE_SERVICE_CONTRACTID,
                                    fileSpec, location, type);
    catman.addCategoryEntry("command-line-argument-handlers",
                            "chatzilla command line handler",
                            CLINE_SERVICE_CONTRACTID, true, true);
    catman.addCategoryEntry("command-line-handler",
                            "m-irc",
                            CLINE_SERVICE_CONTRACTID, true, true);

    debug("*** Registering irc protocol handler.\n");
    ChatzillaProtocols.initObsolete(compMgr, fileSpec, location, type);

    debug("*** Registering done.\n");
}

ChatzillaModule.unregisterSelf =
function cz_mod_unregisterSelf(compMgr, fileSpec, location)
{
    compMgr = compMgr.QueryInterface(Components.interfaces.nsIComponentRegistrar);

    var catman = Components.classes["@mozilla.org/categorymanager;1"]
        .getService(nsICategoryManager);
    catman.deleteCategoryEntry("command-line-argument-handlers",
                               "chatzilla command line handler", true);
    catman.deleteCategoryEntry("command-line-handler",
                               "m-irc", true);
}

function ProcessHandler() {
}

ProcessHandler.prototype = {
  classID: STARTUP_CID,
  QueryInterface(iid) {
    if (iid.equals(nsISupports) || iid.equals(nsIObserver)) {
      return this;
    }

    throw Components.results.NS_ERROR_NO_INTERFACE;
  },

  observe(subject, topic, data) {
    if (topic !== "profile-after-change") {
      return;
    }

    let ppmm = Components.classes["@mozilla.org/parentprocessmessagemanager;1"]
                         .getService(Components.interfaces.nsIMessageBroadcaster);
    ppmm.loadProcessScript("chrome://chatzilla/content/lib/js/chatzilla-protocol-script.js", true);
    ppmm.addMessageListener("Chatzilla:SpawnChatzilla", this);
  },

  receiveMessage(msg) {
    if (msg.name !== "Chatzilla:SpawnChatzilla") {
      return;
    }

    spawnChatZilla(msg.data.uri);
  },
};

var StartupFactory = {
  createInstance(outer, iid) {
    if (outer) {
      throw Components.results.NS_ERROR_NO_AGGREGATION;
    }

    if (!iid.equals(nsISupports)) {
      throw Components.results.NS_ERROR_NO_INTERFACE;
    }

    // startup:
    return new ProcessHandler();
  },
};

ChatzillaModule.getClassObject =
function cz_mod_getClassObject(compMgr, cid, iid)
{
    // Checking if we're disabled in the Chrome Registry.
    var rv;
    try {
        var rdfSvc = Components.classes[RDFS_CONTRACTID].getService(nsIRDFService);
        var rdfDS = rdfSvc.GetDataSource("rdf:chrome");
        var resSelf = rdfSvc.GetResource("urn:mozilla:package:chatzilla");
        var resDisabled = rdfSvc.GetResource("http://www.mozilla.org/rdf/chrome#disabled");
        rv = rdfDS.GetTarget(resSelf, resDisabled, true);
    } catch (e) {
    }
    if (rv)
        throw Components.results.NS_ERROR_NO_INTERFACE;

    if (cid.equals(CLINE_SERVICE_CID))
        return CLineFactory;

    if (cid.equals(IRCPROT_HANDLER_CID))
        return IRCProtocolHandlerFactory;

    if (cid.equals(IRCSPROT_HANDLER_CID))
        return IRCSProtocolHandlerFactory;

    if (cid.equals(STARTUP_CID))
        return StartupFactory;

    if (!iid.equals(Components.interfaces.nsIFactory))
        throw Components.results.NS_ERROR_NOT_IMPLEMENTED;

    throw Components.results.NS_ERROR_NO_INTERFACE;
}

ChatzillaModule.canUnload =
function cz_mod_canUnload(compMgr)
{
    return true;
}

/* entrypoint */
function NSGetModule(compMgr, fileSpec)
{
    return ChatzillaModule;
}

function NSGetFactory(cid)
{
    return ChatzillaModule.getClassObject(null, cid, null);
}
