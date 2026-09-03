import { Component } from '@theme/component';
import { onAnimationEnd } from '@theme/utilities';
import { ThemeEvents, CartUpdateEvent } from '@theme/events';

/**
 * A custom element that displays a cart icon.
 *
 * @typedef {object} Refs
 * @property {HTMLElement} cartBubble - The cart bubble element.
 * @property {HTMLElement} cartBubbleText - The cart bubble text element.
 * @property {HTMLElement} cartBubbleCount - The cart bubble count element.
 *
 * @extends {Component<Refs>}
 */
class CartIcon extends Component {
  requiredRefs = ['cartBubble', 'cartBubbleText', 'cartBubbleCount'];

  /** @type {number} */
  get currentCartCount() {
    return parseInt(this.refs.cartBubbleCount.textContent ?? '0', 10);
  }

  set currentCartCount(value) {
    this.refs.cartBubbleCount.textContent = value < 100 ? String(value) : '';
  }

  connectedCallback() {
    super.connectedCallback();

    document.addEventListener(ThemeEvents.cartUpdate, this.onCartUpdate);
    window.addEventListener('pageshow', this.onPageShow);
    this.ensureCartBubbleIsCorrect();
  }

  disconnectedCallback() {
    super.disconnectedCallback();

    document.removeEventListener(ThemeEvents.cartUpdate, this.onCartUpdate);
    window.removeEventListener('pageshow', this.onPageShow);
  }

  /**
   * Handles the page show event when the page is restored from cache.
   * @param {PageTransitionEvent} event - The page show event.
   */
  onPageShow = (event) => {
    if (event.persisted) {
      this.ensureCartBubbleIsCorrect();
    }
  };

  /**
   * Handles the cart update event.
   * @param {CartUpdateEvent} event - The cart update event.
   */
  onCartUpdate = async (event) => {
    const comingFromProductForm = event.detail.data?.source === 'product-form-component';
    let itemCount = event.detail.data?.itemCount;

    // If itemCount is not provided in data, try getting it from resource (cart items)
    const resource = /** @type {any} */ (event.detail.resource);
    if (typeof itemCount !== 'number' && resource && Array.isArray(resource.items)) {
      itemCount = resource.items.reduce((/** @type {number} */ total, /** @type {any} */ it) => {
        const t = (it.title || '').toLowerCase();
        const h = (it.handle || '').toLowerCase();
        const p = it.properties || {};
        const isAddon =
          t.includes('patch') ||
          h.includes('patch') ||
          t.includes('embroidery') ||
          h.includes('embroidery') ||
          t.includes('addon') ||
          t.includes('surcharge') ||
          h.includes('addon') ||
          p['Addon Type'] ||
          p['_parent_item'] ||
          p['parent_item'];
        return isAddon ? total : total + (it.quantity || 1);
      }, 0);
    }

    if (typeof itemCount !== 'number') {
      return;
    }

    this.renderCartBubble(itemCount, comingFromProductForm);
  };

  /**
   * Renders the cart bubble.
   * @param {number} itemCount - The number of items in the cart.
   * @param {boolean} comingFromProductForm - Whether the cart update is coming from the product form.
   */
  renderCartBubble = async (itemCount, comingFromProductForm, animate = true) => {
    const newCount = comingFromProductForm ? this.currentCartCount + itemCount : itemCount;
    this.currentCartCount = newCount;

    const isEmpty = newCount <= 0;
    this.refs.cartBubbleCount.classList.toggle('hidden', isEmpty);
    this.refs.cartBubble.classList.toggle('visually-hidden', isEmpty);

    if (!isEmpty) {
      this.refs.cartBubble.removeAttribute('hidden');
      this.refs.cartBubble.style.removeProperty('display');
    } else {
      this.refs.cartBubble.setAttribute('hidden', '');
    }

    this.classList.toggle('header-actions__cart-icon--has-cart', !isEmpty);

    sessionStorage.setItem(
      'cart-count',
      JSON.stringify({
        value: String(newCount),
        timestamp: Date.now(),
      })
    );

    if (!animate || isEmpty) return;

    // Ensure element is visible before starting animation
    // Use requestAnimationFrame to ensure the browser sees the state change
    await new Promise((resolve) => requestAnimationFrame(resolve));

    this.refs.cartBubble.classList.add('cart-bubble--animating');
    await onAnimationEnd(this.refs.cartBubbleText);

    this.refs.cartBubble.classList.remove('cart-bubble--animating');
  };

  /**
   * Checks if the cart count is correct.
   */
  ensureCartBubbleIsCorrect = () => {
    // Ensure refs are available
    if (!this.refs.cartBubbleCount) return;

    const sessionStorageCount = sessionStorage.getItem('cart-count');

    // If no session storage data, nothing to check
    if (sessionStorageCount === null) return;

    const visibleCount = this.refs.cartBubbleCount.textContent?.trim() ?? '';

    try {
      const { value, timestamp } = JSON.parse(sessionStorageCount);

      // Check if the stored count matches what's visible
      if (value === visibleCount) return;

      const count = parseInt(value, 10);
      const srvCount = parseInt(visibleCount, 10);

      // Don't let a stale '0' in storage wipe out a positive server-rendered count
      if (srvCount > 0 && count === 0) {
        sessionStorage.setItem(
          'cart-count',
          JSON.stringify({
            value: String(srvCount),
            timestamp: Date.now(),
          })
        );
        return;
      }

      // Only update if timestamp is recent (within 10 seconds)
      if (Date.now() - timestamp < 10000) {
        if (count >= 0) {
          this.renderCartBubble(count, false, false);
        }
      }
    } catch (_) {
      // no-op
    }
  };
}

if (!customElements.get('cart-icon')) {
  customElements.define('cart-icon', CartIcon);
}
