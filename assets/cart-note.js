// import { Component } from '@theme/component';
// import { debounce, fetchConfig } from '@theme/utilities';
// import { cartPerformance } from '@theme/performance';

// /**
//  * A custom element that displays a cart note.
//  */
// class CartNote extends Component {
//   /** @type {AbortController | null} */
//   #activeFetch = null;

//   /**
//    * Handles updates to the cart note.
//    * @param {InputEvent} event - The input event in our text-area.
//    */
//   updateCartNote = debounce(async (event) => {
//     if (!(event.target instanceof HTMLTextAreaElement)) return;

//     const note = event.target.value;
//     if (this.#activeFetch) {
//       this.#activeFetch.abort();
//     }

//     const abortController = new AbortController();
//     this.#activeFetch = abortController;

//     try {
//       const config = fetchConfig('json', {
//         body: JSON.stringify({ note }),
//       });

//       await fetch(Theme.routes.cart_update_url, {
//         ...config,
//         signal: abortController.signal,
//       });
//     } catch (error) {
//     } finally {
//       this.#activeFetch = null;
//       cartPerformance.measureFromEvent('note-update:user-action', event);
//     }
//   }, 200);
// }

// if (!customElements.get('cart-note')) {
//   customElements.define('cart-note', CartNote);
// }
import { Component } from '@theme/component';
import { debounce, fetchConfig } from '@theme/utilities';
import { cartPerformance } from '@theme/performance';

/
 * A custom element that displays a cart note.
 */
class CartNote extends Component {
  / @type {AbortController | null} */
  #activeFetch = null;

  connectedCallback() {
    this.textarea = this.querySelector('textarea');
    if (this.textarea) {
      // Listen to the change event to capture note before checkout navigates away
      this.textarea.addEventListener('change', this.saveNoteImmediately.bind(this));
    }
  }

  async saveNoteImmediately(event) {
    const note = event.target.value;
    if (this.#activeFetch) {
      this.#activeFetch.abort();
    }
    const abortController = new AbortController();
    this.#activeFetch = abortController;
    
    await this.performSave(note, abortController, true);
  }

  updateCartNote = debounce(async (event) => {
    if (!(event.target instanceof HTMLTextAreaElement)) return;
    
    const note = event.target.value;
    if (this.#activeFetch) {
      this.#activeFetch.abort();
    }
    
    const abortController = new AbortController();
    this.#activeFetch = abortController;
    
    await this.performSave(note, abortController, false);
    cartPerformance.measureFromEvent('note-update:user-action', event);
  }, 200);

  async performSave(note, abortController, useKeepalive) {
    try {
      const config = fetchConfig('json', {
        body: JSON.stringify({ note }),
      });

      await fetch(Theme.routes.cart_update_url, {
        ...config,
        signal: useKeepalive ? undefined : abortController.signal,
        keepalive: useKeepalive,
      });

      const cartResponse = await fetch(${Theme.routes.cart_url}.js, {
        signal: useKeepalive ? undefined : abortController.signal,
        keepalive: useKeepalive,
      });
      
      const cart = await cartResponse.json();

      for (let i = 0; i < cart.items.length; i++) {
        const item = cart.items[i];
        
        // Ensure properties is an object, even if it's returned as an empty array []
        let currentProperties = item.properties;
        if (!currentProperties  Array.isArray(currentProperties)) {
          currentProperties = {};
        }
        
        const properties = { ...currentProperties };
        
        if (properties['Cart Note'] !== note) {
          if (note === '') {
            delete properties['Cart Note'];
          } else {
            properties['Cart Note'] = note;
          }
          
          const changeConfig = fetchConfig('json', {
            body: JSON.stringify({
              id: item.key, // Use item.key which is safer than line index
              quantity: item.quantity,
              properties: properties
            })
          });

          await fetch(Theme.routes.cart_change_url  '/cart/change.js', {
            ...changeConfig,
            signal: useKeepalive ? undefined : abortController.signal,
            keepalive: useKeepalive,
          });
        }
      }
    } catch (error) {
    } finally {
      this.#activeFetch = null;
    }
  }
}

if (!customElements.get('cart-note')) {
  customElements.define('cart-note', CartNote);
}