import { Component } from '@theme/component';
import { debounce, onDocumentLoaded, setHeaderMenuStyle } from '@theme/utilities';
import { MegaMenuHoverEvent } from '@theme/events';

/**
 * A custom element that manages a header menu.
 *
 * @typedef {Object} State
 * @property {HTMLElement | null} activeItem - The currently active menu item.
 *
 * @typedef {object} Refs
 * @property {HTMLElement} overflowMenu - The overflow menu.
 * @property {HTMLElement[]} [submenu] - The submenu in each respective menu item.
 *
 * @extends {Component<Refs>}
 */
class HeaderMenu extends Component {
  requiredRefs = ['overflowMenu'];

  /**
   * @type {MutationObserver | null}
   */
  #submenuMutationObserver = null;

  connectedCallback() {
    super.connectedCallback();

    onDocumentLoaded(this.#preloadImages);
    window.addEventListener('resize', this.#resizeListener);
    this.overflowMenu?.addEventListener('pointerleave', this.#overflowSubmenuListener);
    this.addEventListener('pointerenter', this.#onMenuEnter, { capture: true });
    this.addEventListener('pointerover', this.#onMenuEnter, { capture: true });
    this.addEventListener('pointerleave', this.#onMenuLeave);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    clearTimeout(this.#activateTimer);
    clearTimeout(this.#deactivateTimer);
    window.removeEventListener('resize', this.#resizeListener);
    document.body.removeEventListener('pointermove', this.#onPointerMove);
    if (this.#state.activeItem) {
      this.#stopPointerTracking(this.#state.activeItem);
    }
    this.overflowMenu?.removeEventListener('pointerleave', this.#overflowSubmenuListener);
    this.removeEventListener('pointerenter', this.#onMenuEnter, { capture: true });
    this.removeEventListener('pointerover', this.#onMenuEnter, { capture: true });
    this.removeEventListener('pointerleave', this.#onMenuLeave);
    this.#cleanupMutationObserver();
  }

  /**
   * Debounced resize event listener to recalculate menu style
   */
  #resizeListener = debounce(() => {
    setHeaderMenuStyle();
  }, 100);

  #overflowSubmenuListener = () => {
    this.#deactivate();
  };

  #onMenuEnter = () => {
    clearTimeout(this.#deactivateTimer);
  };

  #onMenuLeave = () => {
    clearTimeout(this.#activateTimer);
    clearTimeout(this.#deactivateTimer);
    this.#deactivateTimer = setTimeout(() => {
      if (this.matches(':hover')) return;
      this.#deactivate();
    }, 200);
  };

  /**
   * @type {State}
   */
  #state = {
    activeItem: null,
  };

  /**
   * @type {ReturnType<typeof setTimeout> | undefined}
   */
  #activateTimer;

  /**
   * @type {ReturnType<typeof setTimeout> | undefined}
   */
  #deactivateTimer;

  /**
   * @type {ReturnType<typeof setTimeout> | undefined}
   */
  #pointerIdleTimer;

  /**
   * Last known pointer position for Safari hit-test reconciliation.
   * @type {{ x: number, y: number }}
   */
  #lastPointer = { x: 0, y: 0 };

  /**
   * Update the safety box idle state on the active menu item.
   * @param {PointerEvent} event
   */
  #onPointerMove = (event) => {
    const activeLink = this.#state.activeItem;
    if (!activeLink) return;

    this.#lastPointer.x = event.clientX;
    this.#lastPointer.y = event.clientY;

    const moving = Math.abs(event.movementX) >= 1 || event.movementY >= 1;
    activeLink.dataset.safetyBox = `${moving}`;

    clearTimeout(this.#pointerIdleTimer);
    if (moving) {
      this.#pointerIdleTimer = setTimeout(() => {
        if (this.#state.activeItem) {
          this.#state.activeItem.dataset.safetyBox = 'false';
          this.#reconcilePointerTarget();
        }
      }, 50);
    } else {
      this.#reconcilePointerTarget();
    }
  };

  /**
   * Check if the pointer is over a different menu item and trigger activation if so.
   * Works around Safari not re-evaluating hit targets after pseudo-element changes.
   */
  #reconcilePointerTarget() {
    const { x, y } = this.#lastPointer;
    requestAnimationFrame(() => {
      const activeSubmenu = findSubmenu(this.#state.activeItem);
      if (
        activeSubmenu &&
        (activeSubmenu.matches(':hover') || activeSubmenu.contains(document.elementFromPoint(x, y)))
      ) {
        return;
      }

      const target = document.elementFromPoint(x, y);
      if (!target) return;
      const listItem = target.closest('.menu-list__list-item');
      if (listItem && !listItem.contains(this.#state.activeItem)) {
        listItem.dispatchEvent(new PointerEvent('pointerenter', { bubbles: false }));
      }
    });
  }

  /**
   * Begin pointer tracking for the safety box on the newly active item.
   * @param {HTMLElement} item
   * @param {HTMLElement | null} previousItem
   */
  #startPointerTracking(item, previousItem) {
    if (previousItem) {
      this.#stopPointerTracking(previousItem);
    } else {
      document.body.addEventListener('pointermove', this.#onPointerMove);
    }

    const rect = item.getBoundingClientRect();
    const isOverlap = this.headerComponent?.hasAttribute('data-submenu-overlap-bottom-row');
    const boundary = isOverlap ? this.headerComponent?.querySelector('.header__row--top') : this.headerComponent;
    item.style.setProperty('--box-height', `${(boundary?.getBoundingClientRect().bottom ?? 0) - rect.top}px`);
  }

  /**
   * Stop pointer tracking and remove all safety box properties from an item.
   * @param {HTMLElement} item
   */
  #stopPointerTracking(item) {
    clearTimeout(this.#pointerIdleTimer);
    this.#pointerIdleTimer = undefined;
    item.style.removeProperty('--box-height');
    delete item.dataset.safetyBox;
  }

  /**
   * Get the overflow menu
   */
  get overflowMenu() {
    return /** @type {HTMLElement | null} */ (this.refs.overflowMenu?.shadowRoot?.querySelector('[part="overflow"]'));
  }

  /**
   * Whether the overflow list is hovered
   * @returns {boolean}
   */
  get overflowListHovered() {
    return this.refs.overflowMenu?.shadowRoot?.querySelector('[part="overflow-list"]')?.matches(':hover') ?? false;
  }

  get headerComponent() {
    return /** @type {HTMLElement | null} */ (this.closest('header-component'));
  }

  /**
   * Activate the selected menu item. If another menu is currently active,
   * debounces the switch to prevent accidental closing during diagonal mouse movement.
   * @param {PointerEvent | FocusEvent} event
   */
  activate = (event) => {
    clearTimeout(this.#deactivateTimer);

    if (!(event.target instanceof Element) || !this.headerComponent) return;
    const targetElement = event.target;

    const item = findMenuItem(targetElement);
    if (!item || item === this.#state.activeItem) {
      clearTimeout(this.#activateTimer);
      return;
    }

    // If another submenu is currently open and active
    if (this.#state.activeItem) {
      const activeSubmenu = findSubmenu(this.#state.activeItem);
      // If the cursor is currently inside or hovering the active submenu, ignore activation of other items
      if (
        activeSubmenu &&
        (activeSubmenu.matches(':hover') ||
          activeSubmenu.contains(targetElement) ||
          activeSubmenu.contains(document.elementFromPoint(this.#lastPointer.x, this.#lastPointer.y)))
      ) {
        clearTimeout(this.#activateTimer);
        return;
      }

      // Add a 180ms hover intent delay so diagonal cursor movement across adjacent items
      // (like More or Customise) towards the open submenu options does not trigger an accidental switch.
      clearTimeout(this.#activateTimer);
      this.#activateTimer = setTimeout(() => {
        const currentSubmenu = findSubmenu(this.#state.activeItem);
        if (
          currentSubmenu &&
          (currentSubmenu.matches(':hover') ||
            currentSubmenu.contains(document.elementFromPoint(this.#lastPointer.x, this.#lastPointer.y)))
        ) {
          return;
        }
        this.#executeActivate(item, targetElement);
      }, 180);
      return;
    }

    clearTimeout(this.#activateTimer);
    this.#executeActivate(item, targetElement);
  };

  /**
   * Immediately activate the menu item
   * @param {HTMLElement} item
   * @param {Element} targetElement
   */
  #executeActivate(item, targetElement) {
    this.dispatchEvent(new MegaMenuHoverEvent());

    if (!item || item === this.#state.activeItem) return;

    const isDefaultSlot =
      !item.closest('[slot="overflow"]') && !targetElement.closest('[slot="overflow"], [slot="more"]');

    this.dataset.overflowExpanded = (!isDefaultSlot).toString();

    const previouslyActiveItem = this.#state.activeItem;

    if (previouslyActiveItem) {
      previouslyActiveItem.ariaExpanded = 'false';
    }

    this.#state.activeItem = item;
    this.ariaExpanded = 'true';
    item.ariaExpanded = 'true';

    let submenu = findSubmenu(item);
    const hasSubmenu = Boolean(submenu);

    if (!hasSubmenu && !isDefaultSlot) {
      submenu = this.overflowMenu;
    }

    if (submenu) {
      // Mark submenu as active for content-visibility optimization
      submenu.dataset.active = '';

      // Cleanup any existing mutation observer from previous menu activations
      this.#cleanupMutationObserver();

      // Monitor DOM mutations to catch deferred content injection (from section hydration)
      this.#submenuMutationObserver = new MutationObserver(() => {
        requestAnimationFrame(() => {
          // Double requestAnimationFrame to ensure the height is properly calculated and not defaulting to the contain-intrinsic-size
          requestAnimationFrame(() => {
            if (submenu.offsetHeight > 0) {
              this.headerComponent?.style.setProperty('--submenu-height', `${submenu.offsetHeight}px`);
              this.#cleanupMutationObserver();
            }
          });
        });
      });
      this.#submenuMutationObserver.observe(submenu, { childList: true, subtree: true });

      // Auto-disconnect after 500ms to prevent memory leaks
      setTimeout(() => {
        this.#cleanupMutationObserver();
      }, 500);
    }

    let finalHeight = submenu?.offsetHeight || 0;

    // For overflow menu, the height needs to be either content of the submenu or the total height of the menu list links
    if (!isDefaultSlot) {
      const overflowListHeight = this.#getOverflowListLinksHeight();
      if (hasSubmenu) {
        /* Note: When the submenu is inside the overflow menu, its offsetHeight is not valid due to the lack of padding
         * we could add the padding variables to the submenu.offsetHeight, but measuring the overflowMenu.offsetHeight is just easier */
        const overflowHeight = this.overflowMenu?.offsetHeight || 0;
        finalHeight = Math.max(overflowHeight, overflowListHeight);
      } else {
        finalHeight = overflowListHeight;
      }
    }

    if (!submenu) {
      // If there is no content to open, don't try to open it
      finalHeight = 0;
    }

    this.headerComponent?.style.setProperty('--submenu-height', `${finalHeight}px`);
    this.#setFullOpenHeaderHeight(finalHeight);
    this.style.setProperty('--submenu-opacity', '1');
    this.#startPointerTracking(item, previouslyActiveItem);
  }

  /**
   * Deactivate the active item after a delay
   * @param {PointerEvent | FocusEvent} event
   */
  deactivate(event) {
    if (!(event.target instanceof Element)) return;

    clearTimeout(this.#activateTimer);
    clearTimeout(this.#deactivateTimer);

    const menu = findSubmenu(this.#state.activeItem);
    // Keep the menu open when the pointer/focus moves from its trigger into its
    // submenu. Checking relatedTarget is reliable for both pointer and keyboard
    // transitions; document.activeElement is not updated for pointer movement.
    const isMovingWithinMenu =
      event.relatedTarget instanceof Node && this.#state.activeItem?.parentElement?.contains(event.relatedTarget);
    const isMovingToSubmenu = event.relatedTarget instanceof Node && menu?.contains(event.relatedTarget);
    const isMovingToOverflowMenu =
      event.relatedTarget instanceof Element &&
      (Boolean(event.relatedTarget.closest('[slot="overflow"], [slot="more"]')) ||
        Boolean(this.overflowMenu?.contains(event.relatedTarget)));

    if (isMovingWithinMenu || isMovingToOverflowMenu || isMovingToSubmenu) {
      if (this.#state.activeItem) {
        this.#stopPointerTracking(this.#state.activeItem);
      }
      return;
    }

    // Grace period so moving from the top menu item down to the submenu content does not prematurely close the mega menu
    this.#deactivateTimer = setTimeout(() => {
      const activeMenu = findSubmenu(this.#state.activeItem);
      if (
        activeMenu?.matches(':hover') ||
        this.overflowListHovered ||
        this.overflowMenu?.matches(':hover') ||
        this.#state.activeItem?.matches(':hover') ||
        this.#state.activeItem?.parentElement?.matches(':hover') ||
        this.matches(':hover')
      ) {
        return;
      }
      this.#deactivate();
    }, 250);
  }

  /**
   * Deactivate the active item immediately
   * @param {HTMLElement | null} [item]
   */
  #deactivate = (item = this.#state.activeItem) => {
    clearTimeout(this.#activateTimer);
    clearTimeout(this.#deactivateTimer);
    if (!item || item != this.#state.activeItem) return;

    const submenu = findSubmenu(item);
    if (
      submenu?.matches(':hover') ||
      item.matches(':hover') ||
      item.parentElement?.matches(':hover') ||
      this.overflowListHovered ||
      this.overflowMenu?.matches(':hover') ||
      this.matches(':hover')
    ) {
      return;
    }

    this.headerComponent?.style.setProperty('--submenu-height', '0px');
    this.#setFullOpenHeaderHeight(0);
    this.style.setProperty('--submenu-opacity', '0');
    this.dataset.overflowExpanded = 'false';

    document.body.removeEventListener('pointermove', this.#onPointerMove);
    this.#stopPointerTracking(item);

    this.#state.activeItem = null;
    this.ariaExpanded = 'false';
    item.ariaExpanded = 'false';

    // Remove active state from submenu after animation completes
    if (submenu) {
      delete submenu.dataset.active;
    }
  };

  #getOverflowListLinksHeight() {
    const slottedMenuLinks = this.overflowMenu?.querySelector('slot')?.assignedElements();
    if (!slottedMenuLinks) return this.overflowMenu?.offsetHeight || 0;

    /**
     * @param {(submenu: HTMLElement) => void} cb
     */
    const mapSubmenus = (cb) => {
      slottedMenuLinks.forEach((link) => {
        const submenu = /** @type {HTMLElement | null} */ (link.querySelector('[ref="submenu[]"]'));
        if (submenu) {
          cb(submenu);
        }
      });
    };

    mapSubmenus((submenu) => {
      submenu.style.setProperty('display', 'none');
    });
    const height = this.overflowMenu?.offsetHeight || 0;
    mapSubmenus((submenu) => {
      submenu.style.removeProperty('display');
    });
    return height;
  }

  /**
   * Calculate and set the full open header height. If the submenu is not open, the full open header height is 0.
   * @param {number} submenuHeight
   */
  #setFullOpenHeaderHeight(submenuHeight) {
    if (!this.headerComponent) return;

    const isOverlapSituation = this.headerComponent.hasAttribute('data-submenu-overlap-bottom-row');

    const headerVisibleHeight =
      isOverlapSituation && this.headerComponent.offsetHeight > 0
        ? /** @type {HTMLElement | null} */ (this.headerComponent.querySelector('.header__row--top'))?.offsetHeight ?? 0
        : this.headerComponent.offsetHeight;

    const nothingToOpen = submenuHeight === 0;
    const fullOpenHeaderHeight = nothingToOpen ? 0 : submenuHeight + (headerVisibleHeight ?? 0);

    this.headerComponent?.style.setProperty('--full-open-header-height', `${fullOpenHeaderHeight}px`);
  }

  /**
   * Preload images that are set to load lazily.
   */
  #preloadImages = () => {
    const images = this.querySelectorAll('img[loading="lazy"]');
    images?.forEach((image) => image.removeAttribute('loading'));
  };

  #cleanupMutationObserver() {
    this.#submenuMutationObserver?.disconnect();
    this.#submenuMutationObserver = null;
  }
}

if (!customElements.get('header-menu')) {
  customElements.define('header-menu', HeaderMenu);
}

/**
 * Find the closest menu item.
 * @param {Element | null | undefined} element
 * @returns {HTMLElement | null}
 */
function findMenuItem(element) {
  if (!(element instanceof Element)) return null;

  // If the interaction originates from inside a submenu, it belongs to the submenu's content
  // (links, buttons, text), not a top-level menu item activation trigger.
  if (element.closest('.menu-list__submenu, [ref="submenu[]"]')) {
    return null;
  }

  const moreItem = element.matches('[slot="more"]') ? element : element.closest('[slot="more"]');
  if (moreItem) {
    // Select the first overflowing menu item when hovering over the "More" item
    return findMenuItem(moreItem.parentElement?.querySelector('[slot="overflow"]'));
  }

  if (element.matches('[ref="menuitem"]')) return /** @type {HTMLElement} */ (element);

  // Events can originate from the link title span instead of the list item.
  // Resolve from the closest list item so moving across menu items never drops the active state
  const listItem = element.closest('.menu-list__list-item');
  return /** @type {HTMLElement | null} */ (listItem?.querySelector('[ref="menuitem"]'));
}

/**
 * Find the closest submenu.
 * @param {Element | null | undefined} element
 * @returns {HTMLElement | null}
 */
function findSubmenu(element) {
  const submenu = element?.parentElement?.querySelector('[ref="submenu[]"]');
  return submenu instanceof HTMLElement ? submenu : null;
}
