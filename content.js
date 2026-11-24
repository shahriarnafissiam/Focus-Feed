let settings = {
  cleanFeedMode: false,
  hideStories: true,
  blockMessenger: false,
  messengerBlockEndTime: 0,
  focusEndTime: 0
};

let debounceTimer = null;
let rootObserver = null;
let periodicTimer = null;
let lastUrl = location.href;

function isStrictActive() {
  return typeof settings.focusEndTime === "number" && settings.focusEndTime > Date.now();
}

function isMessengerBlocked() {
  const timerActive =
    typeof settings.messengerBlockEndTime === "number" &&
    settings.messengerBlockEndTime > Date.now();
  return Boolean(settings.blockMessenger) || timerActive;
}

function isCleanFeedActive() {
  return Boolean(settings.cleanFeedMode) || isStrictActive();
}

function isStoriesHiddenActive() {
  return Boolean(settings.hideStories) || isStrictActive();
}

function syncHtmlClasses() {
  const root = document.documentElement;
  if (!root) return;

  if (isCleanFeedActive()) {
    root.classList.add("focusfeed-clean-feed");
  } else {
    root.classList.remove("focusfeed-clean-feed");
  }

  if (isHomePage()) {
    root.classList.add("focusfeed-home");
  } else {
    root.classList.remove("focusfeed-home");
  }

  if (isMessengerBlocked()) {
    root.classList.add("focusfeed-block-messenger");
  } else {
    root.classList.remove("focusfeed-block-messenger");
  }
}

function blockReelsURL() {
  try {
    if (window.location.pathname.indexOf("/reel") !== -1) {
      window.location.replace("https://www.facebook.com/");
    }
  } catch (e) {}
}

function blockMessengerNavigationAndUI() {
  if (!isMessengerBlocked()) return;

  try {
    const path = window.location.pathname || "";
    if (path.indexOf("/messages") === 0 || path.indexOf("/t/") !== -1 || path.indexOf("/e2ee/") !== -1) {
      window.location.replace("https://www.facebook.com/");
      return;
    }

    const selectors = [
      'a[href*="/messages"]',
      'a[aria-label*="Messenger" i]',
      'div[aria-label*="Messenger" i][role="button"]',
      'div[aria-label*="Messenger" i][role="dialog"]',
      'div[aria-label*="Chats" i][role="dialog"]',
      'div[data-pagelet*="Chat" i]'
    ];

    selectors.forEach((sel) => {
      document.querySelectorAll(sel).forEach((el) => {
        el.style.setProperty("display", "none", "important");
        el.style.setProperty("pointer-events", "none", "important");
      });
    });
  } catch (e) {}
}

function restoreMessengerUIIfUnblocked() {
  if (isMessengerBlocked()) return;
  try {
    const selectors = [
      'a[href*="/messages"]',
      'a[aria-label*="Messenger" i]',
      'div[aria-label*="Messenger" i][role="button"]',
      'div[aria-label*="Messenger" i][role="dialog"]',
      'div[aria-label*="Chats" i][role="dialog"]',
      'div[data-pagelet*="Chat" i]'
    ];
    selectors.forEach((sel) => {
      document.querySelectorAll(sel).forEach((el) => {
        el.style.removeProperty("display");
        el.style.removeProperty("pointer-events");
      });
    });
  } catch (e) {}
}

// ---------------------------------------------------------------
// Clean Feed (self-healing) - keeps the "What's on your mind" post box
// and hides everything that comes after it (posts, reels, suggestions...).
//
// Facebook changes class names all the time, so nothing here depends on
// one selector. Layers, from most precise to most generic:
//   1. Find the post composer (the "What's on your mind" box) by its text /
//      label, then hide EVERYTHING that follows it inside the main column.
//   2. Known hooks: role="feed", FeedUnit pagelets, aria-posinset.
//   3. Any visible top-level [role="article"] (a post).
//   4. If the composer can't be found -> hide the whole main column.
//   5. If [role="main"] doesn't exist -> hide the centre column by position.
// Hidden elements get a data-focusfeed-hidden attribute, and are restored
// automatically when Clean Feed is off or you leave the home page.
// ---------------------------------------------------------------
const HIDE_ATTR = "data-focusfeed-hidden";

const COMPOSER_RE = /what'?s on your mind|on your mind|create (a )?post|মনে কী আছে|মনে কি আছে|আপনার মনে|পোস্ট তৈরি/i;

function isHomePage() {
  const p = window.location.pathname || "";
  return p === "/" || p === "/home.php" || p === "/home";
}

function clearHidden() {
  document.querySelectorAll("[" + HIDE_ATTR + "]").forEach((el) => el.removeAttribute(HIDE_ATTR));
}

function hasSize(el) {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

function findComposer(main) {
  const candidates = main.querySelectorAll('[role="button"], [aria-label]');
  for (const el of candidates) {
    if (el.closest('[role="article"]')) continue; // never a post's own comment box
    const label = (el.getAttribute("aria-label") || "") + " " + (el.textContent || "").slice(0, 120);
    if (COMPOSER_RE.test(label)) return el;
  }
  return null;
}

// First post-like element in the main column (works even while it is hidden).
function findFirstPost(main, btn) {
  const post = main.querySelector('[aria-posinset], [role="article"], div[data-pagelet^="FeedUnit"]');
  if (post && !post.contains(btn)) return post;
  const feed = main.querySelector('div[role="feed"]');
  if (feed && !feed.contains(btn)) return feed;
  return null;
}

// Fallback when no post exists to measure against: the composer card is the
// highest ancestor of the button that is still card-sized. Measured with our
// own hiding switched off, and remembered, so hiding never changes the result.
let composerCardCache = null;
function composerCardBySize(main) {
  if (composerCardCache && composerCardCache.isConnected && main.contains(composerCardCache)) {
    return composerCardCache;
  }
  const marked = Array.from(document.querySelectorAll("[" + HIDE_ATTR + "]"));
  const values = marked.map((el) => el.getAttribute(HIDE_ATTR));
  marked.forEach((el) => el.removeAttribute(HIDE_ATTR));
  let card = null;
  const btn = findComposer(main);
  if (btn) {
    card = btn;
    while (card.parentElement && card.parentElement !== main && card.parentElement.getBoundingClientRect().height <= 170) {
      card = card.parentElement;
    }
  }
  marked.forEach((el, i) => el.setAttribute(HIDE_ATTR, values[i]));
  composerCardCache = card;
  return card;
}

// Stories tray (so Clean Feed can leave it alone when Hide Stories is OFF)
let storiesTrayCache = null;
function findStoriesTray(main, composerBtn) {
  if (storiesTrayCache && storiesTrayCache.isConnected && main.contains(storiesTrayCache)) return storiesTrayCache;
  let tray = main.querySelector('[aria-label="Stories"], [data-pagelet*="Stories"]');
  if (!tray) {
    const link = main.querySelector('a[href*="/stories/"]');
    if (link) {
      tray = link;
      while (
        tray.parentElement &&
        tray.parentElement !== main &&
        !(composerBtn && tray.parentElement.contains(composerBtn)) &&
        !tray.parentElement.querySelector('[role="article"]') &&
        tray.parentElement.getBoundingClientRect().height <= 450
      ) {
        tray = tray.parentElement;
      }
    }
  }
  storiesTrayCache = tray || null;
  return storiesTrayCache;
}

// hide `node`, except the branch that holds `keepEl`
function addHidingExcept(node, keepEl, set) {
  if (!keepEl || !node.contains(keepEl)) {
    set.add(node);
    return;
  }
  if (node === keepEl) return;
  Array.from(node.children).forEach((child) => addHidingExcept(child, keepEl, set));
}

function addFollowingSiblings(card, main, set, keepEl) {
  let node = card;
  while (node && node !== main) {
    let sib = node.nextElementSibling;
    while (sib) {
      addHidingExcept(sib, keepEl, set);
      sib = sib.nextElementSibling;
    }
    node = node.parentElement;
  }
}

// Child of the common ancestor that holds the composer (keep it, hide what follows).
function composerBlockBeforePost(btn, post) {
  let block = btn;
  while (block.parentElement && !block.parentElement.contains(post)) {
    block = block.parentElement;
  }
  return block.contains(post) ? null : block;
}

function centerColumnFallback() {
  const old = document.querySelector("[" + HIDE_ATTR + '="geo"]');
  if (old) return old;
  const stop = '[role="banner"],[role="navigation"],[role="complementary"]';
  let el = document.elementFromPoint(window.innerWidth / 2, window.innerHeight * 0.65);
  if (!el) return null;
  while (el.parentElement && el.parentElement !== document.body && !el.parentElement.querySelector(stop)) {
    el = el.parentElement;
  }
  return el && el !== document.body && el !== document.documentElement ? el : null;
}

function applyCleanFeedHard() {
  const active = isCleanFeedActive() && isHomePage();

  try {
    if (!active) {
      clearHidden();
      return;
    }

    const toHide = new Set();
    let geoEl = null;
    let composerBtn = null;
    let keepTray = null;
    const main = document.querySelector('[role="main"]');

    // Layers 2 + 3: known hooks and posts (hidden ones stay in the set)
    document
      .querySelectorAll(
        'div[role="feed"], div[data-pagelet^="FeedUnit"], div[data-pagelet*="MainFeed"], [aria-posinset]'
      )
      .forEach((el) => toHide.add(el));

    document.querySelectorAll('[role="article"]').forEach((a) => {
      if (a.parentElement && a.parentElement.closest('[role="article"]')) return; // skip comments
      const markedAncestor = a.closest("[" + HIDE_ATTR + "]");
      if (markedAncestor) {
        toHide.add(markedAncestor);
        return;
      }
      if (!hasSize(a)) return;
      let top = a;
      while (top.parentElement && top.parentElement !== document.body && top.parentElement.children.length === 1) {
        top = top.parentElement;
      }
      toHide.add(top);
    });

    if (main) {
      const btn = findComposer(main);
      composerBtn = btn;
      // Stories are a separate option: leave the tray alone when Hide Stories is OFF
      const keepEl = isStoriesHiddenActive() ? null : findStoriesTray(main, btn);
      keepTray = keepEl;
      if (btn) {
        // Layer 1: keep the composer, hide everything after it
        const post = findFirstPost(main, btn);
        const block = post ? composerBlockBeforePost(btn, post) : composerCardBySize(main);
        if (block) addFollowingSiblings(block, main, toHide, keepEl);
      } else if (main.children.length) {
        // Layer 4: composer not found -> hide the whole main column
        Array.from(main.children).forEach((c) => addHidingExcept(c, keepEl, toHide));
      }
    } else {
      // Layer 5: no [role="main"] at all
      geoEl = centerColumnFallback();
      if (geoEl) toHide.add(geoEl);
    }

    // never hide the top bar, or a container that holds the composer
    toHide.forEach((el) => {
      if (el === document.body || el === document.documentElement) toHide.delete(el);
      else if (el.querySelector('[role="banner"]')) toHide.delete(el);
      else if (composerBtn && el.contains(composerBtn)) toHide.delete(el);
      else if (keepTray && el.contains(keepTray)) toHide.delete(el);
    });

    // sync: drop stale marks, add new ones
    document.querySelectorAll("[" + HIDE_ATTR + "]").forEach((el) => {
      if (!toHide.has(el)) el.removeAttribute(HIDE_ATTR);
    });
    toHide.forEach((el) => {
      const v = el === geoEl ? "geo" : "1";
      if (el.getAttribute(HIDE_ATTR) !== v) el.setAttribute(HIDE_ATTR, v);
    });
  } catch (e) {
    console.debug("[Focus Feed] clean feed error:", e);
  }
}

function applyStoriesMode() {
  const hideStories = isStoriesHiddenActive();
  const displayVal = hideStories ? "none" : "";

  try {
    document.querySelectorAll('div[aria-label="Stories"]').forEach((el) => {
      if (el.style.display !== displayVal) {
        el.style.setProperty("display", displayVal, hideStories ? "important" : "");
      }
    });

    document.querySelectorAll('a[href*="/stories/create"]').forEach((link) => {
      const tray =
        link.closest('div[aria-label="Stories"]') ||
        link.closest('div[role="region"]') ||
        (link.parentElement &&
          link.parentElement.parentElement &&
          link.parentElement.parentElement.parentElement &&
          link.parentElement.parentElement.parentElement.parentElement);

      if (tray) {
        if (hideStories) {
          tray.style.setProperty("display", "none", "important");
        } else {
          tray.style.removeProperty("display");
        }
      }
    });
  } catch (e) {}
}

document.addEventListener(
  "click",
  (e) => {
    if (!isMessengerBlocked()) return;
    const target = e.target && e.target.closest ? e.target.closest("a, [role='button'], button") : null;
    if (!target) return;

    const href = (target.getAttribute("href") || "").toLowerCase();
    const aria = (target.getAttribute("aria-label") || "").toLowerCase();
    const txt = (target.textContent || "").trim().toLowerCase();

    if (
      href.indexOf("/messages") !== -1 ||
      href.indexOf("/t/") !== -1 ||
      aria.indexOf("messenger") !== -1 ||
      aria.indexOf("chats") !== -1 ||
      txt === "messenger"
    ) {
      e.preventDefault();
      e.stopPropagation();
      blockMessengerNavigationAndUI();
    }
  },
  true
);

function runAllRules() {
  syncHtmlClasses();
  blockReelsURL();
  applyCleanFeedHard();
  applyStoriesMode();
  if (isMessengerBlocked()) {
    blockMessengerNavigationAndUI();
  } else {
    restoreMessengerUIIfUnblocked();
  }
}

function scheduleRun(delay = 80) {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(runAllRules, delay);
}

function startWatchers() {
  if (rootObserver) rootObserver.disconnect();
  const target = document.documentElement || document.body;
  if (!target) return;

  rootObserver = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
    }
    scheduleRun(80);
  });

  rootObserver.observe(target, { childList: true, subtree: true });

  clearInterval(periodicTimer);
  periodicTimer = setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
    }
    runAllRules();
  }, 1000);
}

function initExtension() {
  chrome.storage.local.get(
    {
      cleanFeedMode: false,
      hideStories: true,
      blockMessenger: false,
      messengerBlockEndTime: 0,
      focusEndTime: 0
    },
    (data) => {
      settings = { ...settings, ...data };
      runAllRules();
      startWatchers();
    }
  );
}

initExtension();

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;

  if (changes.cleanFeedMode) settings.cleanFeedMode = Boolean(changes.cleanFeedMode.newValue);
  if (changes.hideStories) settings.hideStories = Boolean(changes.hideStories.newValue);
  if (changes.blockMessenger) settings.blockMessenger = Boolean(changes.blockMessenger.newValue);
  if (changes.messengerBlockEndTime) {
    settings.messengerBlockEndTime = Number(changes.messengerBlockEndTime.newValue) || 0;
  }
  if (changes.focusEndTime) settings.focusEndTime = Number(changes.focusEndTime.newValue) || 0;

  runAllRules();
});
