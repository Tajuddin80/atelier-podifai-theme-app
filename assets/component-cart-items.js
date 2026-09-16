import { Component } from '@theme/component';
import {
  fetchConfig,
  debounce,
  onAnimationEnd,
  prefersReducedMotion,
  resetShimmer,
  startViewTransition,
} from '@theme/utilities';
import { morphSection, sectionRenderer } from '@theme/section-renderer';
import {
  ThemeEvents,
  CartUpdateEvent,
  QuantitySelectorUpdateEvent,
  CartAddEvent,
  DiscountUpdateEvent,
} from '@theme/events';
import { cartPerformance } from '@theme/performance';

/** @typedef {import('./utilities').TextComponent} TextComponent */

/**
 * Checks if a cart line item is a companion add-on product (patch/embroidery fee).
 * Customized bag products are NEVER considered add-ons.
 * @param {any} it - The cart item.
 * @returns {boolean} Whether this item is an add-on companion.
 */
function isCompanionAddon(it) {
  if (!it) return false;
  const p = it.properties || {};
  // If it has customization preview or custom data, it is a main bag, NEVER an add-on!
  if (
    p['_Customization Data'] ||
    p['_Preview'] ||
    p['Preview'] ||
    p['Customisation Preview'] ||
    p['Customization Preview'] ||
    p['Customisation'] ||
    p['Customization']
  ) {
    return false;
  }
  const itTitle = (it.title || it.product_title || '').toLowerCase();
  const itHandle = (it.handle || '').toLowerCase();
  const itAddonType = p['Add on Type'] || p['Addon Type'] || p['_addon_type'] || p['_Add_on_Type'] || '';
  const itParent = p['_parent_item'] || p['parent_item'] || '';

  return (
    Boolean(itAddonType) ||
    Boolean(itParent) ||
    Boolean(p['_is_companion']) ||
    itTitle.includes('addon') ||
    itTitle.includes('add on') ||
    itTitle.includes('surcharge') ||
    itHandle.includes('addon') ||
    itHandle.includes('add-on')
  );
}

/**
 * A custom element that displays a cart items component.
 *
 * @typedef {object} Refs
 * @property {HTMLElement[]} quantitySelectors - The quantity selector elements.
 * @property {HTMLTableRowElement[]} cartItemRows - The cart item rows.
 * @property {TextComponent} cartTotal - The cart total.
 *
 * @extends {Component<Refs>}
 */
class CartItemsComponent extends Component {
  #debouncedOnChange = debounce(this.#onQuantityChange, 300).bind(this);

  connectedCallback() {
    super.connectedCallback();

    document.addEventListener(ThemeEvents.cartUpdate, this.#handleCartUpdate);
    document.addEventListener(ThemeEvents.discountUpdate, this.handleDiscountUpdate);
    document.addEventListener(ThemeEvents.quantitySelectorUpdate, this.#debouncedOnChange);
  }

  disconnectedCallback() {
    super.disconnectedCallback();

    document.removeEventListener(ThemeEvents.cartUpdate, this.#handleCartUpdate);
    document.removeEventListener(ThemeEvents.discountUpdate, this.handleDiscountUpdate);
    document.removeEventListener(ThemeEvents.quantitySelectorUpdate, this.#debouncedOnChange);
  }

  /**
   * Handles QuantitySelectorUpdateEvent change event.
   * @param {QuantitySelectorUpdateEvent} event - The event.
   */
  #onQuantityChange(event) {
    if (!(event.target instanceof Node) || !this.contains(event.target)) return;

    const { quantity, cartLine: line } = event.detail;
    const targetElement = event.target instanceof Element ? event.target : null;

    // Cart items require a line or key
    if (!line && !targetElement?.closest('[data-key]') && !targetElement?.getAttribute('data-line-key')) return;

    const lineItemRow = /** @type {HTMLElement | null} */ (
      targetElement?.closest('tr[data-key]') ||
      (targetElement?.getAttribute('data-key')
        ? this.querySelector(`tr[data-key="${targetElement.getAttribute('data-key')}"]`)
        : null) ||
      (targetElement?.getAttribute('data-line-key')
        ? this.querySelector(`tr[data-key="${targetElement.getAttribute('data-line-key')}"]`)
        : null) ||
      this.refs.cartItemRows?.find((r) => r.dataset.line == String(line)) ||
      (this.refs.cartItemRows && typeof line === 'number' && this.refs.cartItemRows[line - 1]) ||
      null
    );

    const itemKey =
      lineItemRow?.dataset?.key ||
      targetElement?.getAttribute('data-line-key') ||
      targetElement?.getAttribute('data-key') ||
      undefined;
    const bundleId = lineItemRow?.dataset?.bundleId || targetElement?.getAttribute('data-bundle-id') || undefined;

    if (!itemKey && !line) return;

    if (quantity === 0) {
      return this.onLineItemRemove(line || 1, event, itemKey, bundleId);
    }

    this.updateQuantity(
      {
        line,
        key: itemKey,
        bundleId,
        quantity,
        action: 'change',
      },
      lineItemRow
    );

    if (lineItemRow) {
      const textComponent = /** @type {TextComponent | undefined} */ (lineItemRow.querySelector('text-component'));
      textComponent?.shimmer();
    }
  }

  /**
   * Handles the line item removal.
   * @param {number|string} line - The line item index.
   * @param {Event} [event] - The triggering event.
   * @param {string} [itemKey] - The item key.
   * @param {string} [bundleId] - The bundle id.
   */
  onLineItemRemove(line, event, itemKey, bundleId) {
    const triggerEl = event?.target instanceof Element ? event.target : null;
    const numLine = typeof line === 'number' ? line : parseInt(String(line), 10) || 1;
    const cartItemRowToRemove = /** @type {HTMLElement | null} */ (
      triggerEl?.closest('tr[data-key]') ||
      (itemKey ? this.querySelector(`tr[data-key="${itemKey}"]`) : null) ||
      this.refs.cartItemRows?.find((r) => r.dataset.line == String(line)) ||
      (this.refs.cartItemRows && this.refs.cartItemRows[numLine - 1]) ||
      null
    );

    const key = itemKey || cartItemRowToRemove?.dataset?.key || undefined;
    const bundle = bundleId || cartItemRowToRemove?.dataset?.bundleId || undefined;

    this.updateQuantity(
      {
        line: numLine,
        key,
        bundleId: bundle,
        quantity: 0,
        action: 'clear',
      },
      cartItemRowToRemove
    );

    if (!cartItemRowToRemove) return;

    const rowsToRemove = [
      cartItemRowToRemove,
      // Get all nested lines or bundled companions of the row to remove
      ...this.refs.cartItemRows.filter(
        (row) =>
          row !== cartItemRowToRemove &&
          ((cartItemRowToRemove.dataset.key && row.dataset.parentKey === cartItemRowToRemove.dataset.key) ||
            (bundle && row.dataset.bundleId === bundle))
      ),
    ];

    // If the cart item row is the last visible row, optimistically trigger the cart empty state
    const visibleRows = Array.from(this.querySelectorAll('tbody tr[data-key]'));
    const isLastItem = rowsToRemove.length >= visibleRows.length;

    const template = document.getElementById('empty-cart-template');
    if (isLastItem && template instanceof HTMLTemplateElement) {
      const clone = document.importNode(template.content, true);

      startViewTransition(() => {
        this.replaceChildren(clone);
      }, [this.isDrawer ? 'empty-cart-drawer' : 'empty-cart-page']);

      return;
    }

    // Add class to the row to trigger the animation
    rowsToRemove.forEach((row) => {
      const remove = () => row.remove();

      if (prefersReducedMotion()) return remove();

      row.style.setProperty('--row-height', `${row.clientHeight}px`);
      row.classList.add('removing');

      // Remove the row after the animation ends
      onAnimationEnd(row, remove);
    });
  }

  /**
   * Updates the quantity and handles companion add-ons synchronization.
   * @param {Object} config - The config.
   * @param {number} [config.line] - The line.
   * @param {string} [config.key] - The line item key.
   * @param {string} [config.bundleId] - The bundle id.
   * @param {number} config.quantity - The quantity.
   * @param {string} config.action - The action.
   * @param {HTMLElement | null} [targetRow] - The target table row.
   */
  async updateQuantity(config, targetRow) {
    const cartPerformaceUpdateMarker = cartPerformance.createStartingMarker(`${config.action}:user-action`);

    this.#disableCartItems();

    const { line, key, bundleId, quantity } = config;
    const { cartTotal } = this.refs;

    const cartItemsComponents = document.querySelectorAll('cart-items-component');
    const sectionsToUpdate = new Set([this.sectionId]);
    cartItemsComponents.forEach((item) => {
      if (item instanceof HTMLElement && item.dataset.sectionId) {
        sectionsToUpdate.add(item.dataset.sectionId);
      }
    });

    cartTotal?.shimmer();

    try {
      // Fetch latest cart state to accurately resolve keys, bundle companions and orphan add-ons
      const cartState = await fetch('/cart.js', {
        headers: { Accept: 'application/json' },
      }).then((r) => r.json());

      /** @type {any} */
      let targetItem = null;
      if (key) {
        targetItem = cartState.items.find((/** @type {any} */ it) => it.key === key);
      }
      if (!targetItem && line && cartState.items[line - 1]) {
        targetItem = cartState.items[line - 1];
      }

      /** @type {Record<string, number>} */
      const updates = {};

      if (targetItem) {
        const itemBundleId = targetItem.properties?._bundle_id || bundleId;

        // Set primary item quantity
        updates[targetItem.key] = quantity;

        // Synchronize companion add-ons ONLY for this specific bundle
        for (const it of cartState.items) {
          if (it.key === targetItem.key) continue;
          if (!isCompanionAddon(it)) continue; // CRITICAL: Never touch another main customized bag!

          const itBundleId = it.properties?._bundle_id;
          const matchesThisBundle = itemBundleId && itBundleId === itemBundleId;

          if (matchesThisBundle) {
            if (quantity === 0) {
              // Removing bag -> remove its addons
              updates[it.key] = 0;
            } else {
              // Scale addon quantity proportionally
              const patchesPerBag = parseInt(it.properties?._patches_per_bag || '0', 10);
              const embPerBag = parseInt(it.properties?._embroidery_per_bag || '0', 10);
              if (patchesPerBag > 0) {
                updates[it.key] = patchesPerBag * quantity;
              } else if (embPerBag > 0) {
                updates[it.key] = embPerBag * quantity;
              } else {
                updates[it.key] = quantity;
              }
            }
          }
        }
      } else if (key) {
        updates[key] = quantity;
      } else if (line) {
        updates[String(line)] = quantity;
      }

      // Check ONLY for orphan companion add-ons whose parent bag is no longer present
      for (const it of cartState.items) {
        if (updates[it.key] !== undefined) continue;
        if (!isCompanionAddon(it)) continue; // CRITICAL: Never treat a bag as an add-on!

        const itBundleId = it.properties?._bundle_id;
        if (itBundleId) {
          const hasParentBag = cartState.items.some((/** @type {any} */ parent) => {
            if (parent.key === it.key) return false;
            if (isCompanionAddon(parent)) return false; // Parent must be a bag
            if (updates[parent.key] === 0) return false; // Parent is being removed

            return parent.properties?._bundle_id === itBundleId;
          });

          if (!hasParentBag) {
            updates[it.key] = 0;
          }
        }
      }

      const updateUrl = Theme.routes?.cart_update_url || '/cart/update.js';
      const body = JSON.stringify({
        updates: updates,
        sections: Array.from(sectionsToUpdate).join(','),
        sections_url: window.location.pathname,
      });

      const response = await fetch(updateUrl, fetchConfig('json', { body }));
      const responseText = await response.text();
      const parsedResponseText = JSON.parse(responseText);

      resetShimmer(this);

      if (parsedResponseText.errors) {
        this.#handleCartError(line || 1, parsedResponseText);
        return;
      }

      const newSectionHTML = new DOMParser().parseFromString(
        parsedResponseText.sections[this.sectionId] || '',
        'text/html'
      );

      // Grab the new cart item count from a hidden element
      const newCartHiddenItemCount = newSectionHTML.querySelector('[ref="cartItemCount"]')?.textContent;
      let newCartItemCount = newCartHiddenItemCount ? parseInt(newCartHiddenItemCount, 10) : 0;
      if (isNaN(newCartItemCount)) {
        newCartItemCount = parsedResponseText.item_count || 0;
      }

      // Update data-cart-quantity for all matching variants
      this.#updateQuantitySelectors(parsedResponseText);

      this.dispatchEvent(
        new CartUpdateEvent(parsedResponseText, this.sectionId, {
          itemCount: newCartItemCount,
          source: 'cart-items-component',
          sections: parsedResponseText.sections,
        })
      );

      if (parsedResponseText.sections?.[this.sectionId]) {
        morphSection(this.sectionId, parsedResponseText.sections[this.sectionId], {
          mode: this.isDrawer ? 'hydration' : 'full',
        });
      }

      // Update other cart-items components if present
      document.querySelectorAll('cart-items-component').forEach((otherComp) => {
        if (otherComp !== this && otherComp instanceof CartItemsComponent && otherComp.dataset.sectionId) {
          const secHtml = parsedResponseText.sections?.[otherComp.dataset.sectionId];
          if (secHtml) {
            morphSection(otherComp.dataset.sectionId, secHtml, {
              mode: otherComp.isDrawer ? 'hydration' : 'full',
            });
          }
        }
      });

      this.#updateCartQuantitySelectorButtonStates();

      // Trigger global synchronization for header badge and free shipping bar
      const win = /** @type {any} */ (window);
      if (typeof win.syncCartEngine === 'function') {
        win.syncCartEngine();
      }
      if (typeof win.updateHeaderCountUI === 'function') {
        win.updateHeaderCountUI(newCartItemCount);
      }
    } catch (error) {
      console.error('Failed to update cart quantity:', error);
    } finally {
      this.#enableCartItems();
      cartPerformance.measureFromMarker(cartPerformaceUpdateMarker);
    }
  }

  /**
   * Handles the discount update.
   * @param {DiscountUpdateEvent} event - The event.
   */
  handleDiscountUpdate = (event) => {
    this.#handleCartUpdate(event);
  };

  /**
   * Handles the cart error.
   * @param {number} line - The line.
   * @param {Object} parsedResponseText - The parsed response text.
   * @param {string} parsedResponseText.errors - The errors.
   */
  #handleCartError = (line, parsedResponseText) => {
    const quantitySelector = this.refs.quantitySelectors[line - 1];
    const quantityInput = quantitySelector?.querySelector('input');

    if (!quantityInput) throw new Error('Quantity input not found');

    quantityInput.value = quantityInput.defaultValue;

    const cartItemError = this.refs[`cartItemError-${line}`];
    const cartItemErrorContainer = this.refs[`cartItemErrorContainer-${line}`];

    if (!(cartItemError instanceof HTMLElement)) throw new Error('Cart item error not found');
    if (!(cartItemErrorContainer instanceof HTMLElement)) throw new Error('Cart item error container not found');

    cartItemError.textContent = parsedResponseText.errors;
    cartItemErrorContainer.classList.remove('hidden');
  };

  /**
   * Handles the cart update.
   *
   * @param {DiscountUpdateEvent | CartUpdateEvent | CartAddEvent} event
   */
  #handleCartUpdate = (event) => {
    if (event instanceof DiscountUpdateEvent) {
      sectionRenderer.renderSection(this.sectionId, { cache: false });
      return;
    }
    if (event.target === this) return;

    const cartItemsHtml = event.detail.data.sections?.[this.sectionId];
    if (cartItemsHtml) {
      morphSection(this.sectionId, cartItemsHtml);

      // Update button states for all cart quantity selectors after morph
      this.#updateCartQuantitySelectorButtonStates();
    } else {
      sectionRenderer.renderSection(this.sectionId, { cache: false });
    }
  };

  /**
   * Disables the cart items.
   */
  #disableCartItems() {
    this.classList.add('cart-items-disabled');
  }

  /**
   * Enables the cart items.
   */
  #enableCartItems() {
    this.classList.remove('cart-items-disabled');
  }

  /**
   * Updates quantity selectors for all matching variants in the cart.
   * @param {Object} updatedCart - The updated cart object.
   * @param {Array<any>} [updatedCart.items] - The cart items.
   */
  #updateQuantitySelectors(updatedCart) {
    if (!updatedCart.items) return;

    for (const item of updatedCart.items) {
      // 1. First update by exact line item key for cart drawer / cart page
      const keySelectors = document.querySelectorAll(
        `quantity-selector-component[data-line-key="${item.key}"], cart-quantity-selector-component[data-line-key="${item.key}"]`
      );

      for (const selector of keySelectors) {
        const input = selector.querySelector('input');
        if (!input) continue;

        input.value = item.quantity.toString();
        input.setAttribute('data-cart-quantity', item.quantity.toString());

        if ('updateButtonStates' in selector && typeof selector.updateButtonStates === 'function') {
          selector.updateButtonStates();
        }
      }

      // 2. Also update generic non-cart selectors on product pages by variantId
      const variantId = item.variant_id.toString();
      const variantSelectors = document.querySelectorAll(
        `quantity-selector-component:not([data-line-key])[data-variant-id="${variantId}"]`
      );

      for (const selector of variantSelectors) {
        const input = selector.querySelector('input[data-cart-quantity]');
        if (!input) continue;

        input.setAttribute('data-cart-quantity', item.quantity.toString());

        if ('updateCartQuantity' in selector && typeof selector.updateCartQuantity === 'function') {
          selector.updateCartQuantity();
        }
      }
    }
  }

  /**
   * Updates button states for all cart quantity selector components.
   */
  #updateCartQuantitySelectorButtonStates() {
    for (const selector of document.querySelectorAll('cart-quantity-selector-component')) {
      /** @type {any} */ (selector).updateButtonStates?.();
    }
  }

  /**
   * Gets the section id.
   * @returns {string} The section id.
   */
  get sectionId() {
    const { sectionId } = this.dataset;

    if (!sectionId) throw new Error('Section id missing');

    return sectionId;
  }

  /**
   * @returns {boolean} Whether the component is a drawer.
   */
  get isDrawer() {
    return this.dataset.drawer !== undefined;
  }
}

if (!customElements.get('cart-items-component')) {
  customElements.define('cart-items-component', CartItemsComponent);
}
