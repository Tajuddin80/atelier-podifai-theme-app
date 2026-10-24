### Step 1: Create the Patch Product & Variants in Shopify Admin

Because you want these kept **Unlisted** (so regular shoppers cannot find or buy them as standalone products), create them like this:

1. In **Shopify Admin**, go to **Products** $\rightarrow$ **Add product**.
2. **Title**:
   - For Alphabet: e.g. `Red Glitter Letters` or `Black Capital Letters`
   - For Characters: e.g. `Space Patches` or `Cute Animals`
3. **Status**: Select **Unlisted** *(this keeps it 100% hidden from your public storefront catalog)*.
4. **Options & Variants**:
   - Scroll to **Variants** and click **Add options** (or **Edit options**).
   - **For Alphabet (Letters A to Z):**
     - **Option 1 Name**: `Style` $\rightarrow$ Value: e.g. `Red glitter` (or your category name)
     - Click **Add another option** $\rightarrow$ **Option 2 Name**: `Letter`
     - **Option 2 Values**: Paste this comma-separated list:
       ```text
       A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S, T, U, V, W, X, Y, Z
       ```
       *(Shopify will automatically generate all 26 variants: `Red glitter / A`, `Red glitter / B`, etc.)*
   - **For Characters (P1 to P10):**
     - **Option 1 Name**: `Category` $\rightarrow$ Value: e.g. `Space`
     - Click **Add another option** $\rightarrow$ **Option 2 Name**: `Patch`
     - **Option 2 Values**: Paste:
       ```text
       P1, P2, P3, P4, P5, P6, P7, P8, P9, P10
       ```
5. **Pricing & Inventory**:
   - Set the price to **RM 6.00** for all variants.
   - Under inventory, check **"Continue selling when out of stock"** so it is never marked as sold out.
6. Click **Save**.

---

### Step 2: Upload Images to the Product Metafield

Your images are stored in a **List of files** Metafield on your main customizable product (e.g. Joy Bag):

#### 2.1 Ensure the Metafield Definition Exists *(One-time check)*:
1. Go to **Shopify Admin** $\rightarrow$ **Settings** (bottom left) $\rightarrow$ **Custom data** $\rightarrow$ **Products**.
2. If you don't already have one for your category, click **Add definition**:
   - **Name**: e.g. `Red Glitter Letters` or `Space Patches`
   - **Namespace and key**: e.g. `custom.red_glitter` or `custom.space_patches`
   - **Type**: Choose **File** $\rightarrow$ select **List of files** $\rightarrow$ check **Images only**.
   - Click **Save**.

#### 2.2 Upload the Patch Images:
1. Go to **Products** $\rightarrow$ click your customizable bag (e.g. **Joy Bag**).
2. Scroll to the very bottom to the **Metafields** section.
3. Click your metafield (e.g. *Red Glitter Letters* or *Space Patches*).
4. Click **Select files** and upload all your transparent PNG patch images.
   - *Tip for Alphabet*: Upload or order them from A to Z.
   - *Tip for Characters*: In Shopify Files, you can set the **Alt text** of each image to `P1`, `P2`, `P3`, etc.
5. Click **Save** on the product page.

---

### Step 3: Connect the Category in the Theme Customizer

Now connect the Metafield and the Unlisted Product in the theme editor:

1. In Shopify Admin, go to **Online Store** $\rightarrow$ **Themes** $\rightarrow$ click **Customize**.
2. At the top dropdown, select **Products** $\rightarrow$ **Default product** (or open your Joy Bag product page).
3. In the left sidebar under **Atelier Custom Product**:
   - To add an alphabet category: Click **Add block** $\rightarrow$ select **Alphabet Category**.
   - To add character patches: Click **Add block** $\rightarrow$ select **Character Category**.
4. Configure the block settings on the right side:
   - **Category Title**: Enter the title (e.g. `Red glitter` or `Space`).
   - **Patch Size**: Keep `8cm x 8cm`.
   - **Patch Product (For Pricing & Inventory)**:
     - Click **Select product** and choose the **Unlisted product** you created in Step 1 (e.g. *Red Glitter Letters* or *Space Patches*).
     - *This allows the theme to read all 26 variants directly even though the product is Unlisted.*
   - **Load from Metaobject or Metafield**: Check this box $\checkmark$.
   - **Metafield or Metaobject Key**: Type the key you created in Step 2 (e.g. `red_glitter` or `space_patches`).
5. Click **Save** (top right).

---

### Step 4: Customer UI & Checkout Flow (Automatic)

Everything is now completely automated:

1. **In the Customizer UI**:
   - The theme reads the Metafield list of files and renders the patch icons in the category tab.
2. **Customer Interaction**:
   - When the customer clicks or drags a patch onto the bag, the live price updates by **+RM 6.00** per patch.
3. **Adding to Bag**:
   - When the customer clicks **Add to Bag**, our customizer engine:
     - Detects the category (e.g. `Red glitter`) and letter/number (e.g. `A` or `P1`).
     - Matches the exact Shopify variant from your Unlisted product (`Red glitter / A`).
     - Packages the bag and the patches together as a companion bundle with preview snapshots.
4. **Checkout**:
   - At checkout, each patch appears with its proper variant name (`Red glitter / A`), priced at **RM 6.00**, linked directly to the customized bag.