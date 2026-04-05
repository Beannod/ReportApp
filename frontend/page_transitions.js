(function () {
  var DURATION_MS = 260;
  var navigationInProgress = false;

  function injectStyles() {
    if (document.getElementById('page-transition-style')) return;
    var style = document.createElement('style');
    style.id = 'page-transition-style';
    style.textContent = [
      'body { transition: opacity 260ms ease, transform 260ms cubic-bezier(0.22, 0.61, 0.36, 1); }',
      'body.pt-pre-enter { opacity: 0; transform: translateY(10px) scale(0.995); }',
      'body.pt-enter-active { opacity: 1; transform: translateY(0) scale(1); }',
      'body.pt-exit-active { opacity: 0; transform: translateY(-8px) scale(0.995); pointer-events: none; }',
      '@media (prefers-reduced-motion: reduce) {',
      '  body, body.pt-pre-enter, body.pt-enter-active, body.pt-exit-active { transition: none !important; transform: none !important; opacity: 1 !important; }',
      '}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function runEnterAnimation() {
    if (!document.body) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    document.body.classList.add('pt-pre-enter');
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        document.body.classList.add('pt-enter-active');
        document.body.classList.remove('pt-pre-enter');
        setTimeout(function () {
          if (!document.body) return;
          document.body.classList.remove('pt-enter-active');
        }, DURATION_MS + 120);
      });
    });
  }

  function navigateWithTransition(url) {
    if (!url) return;
    if (navigationInProgress) {
      window.location.href = url;
      return;
    }
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      window.location.href = url;
      return;
    }
    navigationInProgress = true;
    if (!document.body) {
      window.location.href = url;
      return;
    }
    document.body.classList.add('pt-exit-active');
    setTimeout(function () {
      window.location.href = url;
    }, DURATION_MS);
  }

  function isInternalNavigableLink(anchor) {
    if (!anchor) return false;
    if (anchor.target && anchor.target !== '_self') return false;
    if (anchor.hasAttribute('download')) return false;
    var rawHref = anchor.getAttribute('href');
    if (!rawHref) return false;
    var lower = rawHref.toLowerCase();
    if (lower.charAt(0) === '#') return false;
    if (lower.indexOf('javascript:') === 0) return false;
    if (lower.indexOf('mailto:') === 0 || lower.indexOf('tel:') === 0) return false;

    var targetUrl;
    try {
      targetUrl = new URL(anchor.href, window.location.href);
    } catch (_err) {
      return false;
    }
    if (targetUrl.origin !== window.location.origin) return false;
    if (targetUrl.href === window.location.href) return false;
    return true;
  }

  window.navigateWithTransition = navigateWithTransition;

  document.addEventListener('click', function (event) {
    if (event.defaultPrevented) return;
    if (event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    var anchor = event.target && event.target.closest ? event.target.closest('a[href]') : null;
    if (!isInternalNavigableLink(anchor)) return;

    event.preventDefault();
    var target = new URL(anchor.href, window.location.href);
    navigateWithTransition(target.pathname + target.search + target.hash);
  }, true);

  injectStyles();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runEnterAnimation);
  } else {
    runEnterAnimation();
  }
})();
