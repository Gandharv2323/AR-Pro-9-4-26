/**
 * catalogue.js
 * Product catalogue panel — slides in from right.
 * Populated from manifest.json.
 * Supports direct-touch hovering and tap-to-select.
 */

export class Catalogue extends EventTarget {
  constructor() {
    super();
    this._panel      = document.getElementById('catalogue');
    this._tabs       = document.getElementById('catalogueTabs');
    this._grid       = document.getElementById('catalogueGrid');
    this._closeBtn   = document.getElementById('catalogueClose');
    this._isOpen     = false;

    this._items      = [];     // All items from manifest
    this._activeCategory = null;
    this._selectedId     = null;
    this._touchHoverId   = null;

    this._closeBtn.addEventListener('click', () => this.close());
    document.getElementById('ccToggleCatalogue')
      ?.addEventListener('click', () => this.toggle());
  }

  /** Load manifest.json and build the panel */
  async load(manifestUrl = './manifest.json') {
    try {
      const res = await fetch(manifestUrl);
      const data = await res.json();
      this._items = data.items ?? [];
    } catch {
      // Use fallback placeholder items
      this._items = _fallbackItems();
    }
    this._buildTabs();
    const firstCat = this._categories()[0];
    if (firstCat) this._showCategory(firstCat);
  }

  _categories() {
    return [...new Set(this._items.map(i => i.category))];
  }

  _buildTabs() {
    this._tabs.innerHTML = '';
    const EMOJI = { glasses: '👓', shirt: '👕', hat: '🎩', watch: '⌚', bag: '👜' };
    for (const cat of this._categories()) {
      const btn = document.createElement('button');
      btn.className = 'tab-btn';
      btn.dataset.cat = cat;
      btn.textContent = `${EMOJI[cat] ?? '📦'} ${_capitalise(cat)}`;
      btn.addEventListener('click', () => this._showCategory(cat));
      this._tabs.appendChild(btn);
    }
  }

  _showCategory(cat) {
    this._activeCategory = cat;

    // Update tab states
    this._tabs.querySelectorAll('.tab-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.cat === cat);
    });

    // Build grid
    this._grid.innerHTML = '';
    const catItems = this._items.filter(i => i.category === cat);

    for (const item of catItems) {
      const card = document.createElement('div');
      card.className = 'cat-item';
      card.dataset.id = item.id;
      if (item.id === this._selectedId) card.classList.add('selected');

      const thumb = document.createElement('div');
      thumb.className = 'cat-thumb';

      if (item.thumbnail) {
        const img = document.createElement('img');
        img.src = item.thumbnail; img.alt = item.name;
        img.onerror = () => { thumb.textContent = EMOJI[item.category] ?? '📦'; };
        thumb.appendChild(img);
      } else {
        thumb.textContent = _categoryEmoji(item.category);
        thumb.style.fontSize = '48px';
      }

      const name = document.createElement('div');
      name.className = 'cat-name'; name.textContent = item.name;

      if (item.isNew) {
        const badge = document.createElement('span');
        badge.className = 'cat-badge'; badge.textContent = 'NEW';
        card.appendChild(badge);
      }

      card.appendChild(thumb); card.appendChild(name);
      card.addEventListener('click', () => this._selectItem(item));
      this._grid.appendChild(card);
    }

    this.dispatchEvent(new CustomEvent('category-change', { detail: { category: cat } }));
  }

  _selectItem(item) {
    this._selectedId = item.id;
    // Update visual selection
    this._grid.querySelectorAll('.cat-item').forEach(c => {
      c.classList.toggle('selected', c.dataset.id === item.id);
    });
    this.dispatchEvent(new CustomEvent('item-select', { detail: { item } }));
  }

  /** Highlight item under direct-touch finger */
  setTouchHover(itemId) {
    if (this._touchHoverId === itemId) return;
    this._touchHoverId = itemId;
    this._grid.querySelectorAll('.cat-item').forEach(c => {
      c.classList.toggle('touch-hover', c.dataset.id === itemId);
    });
  }

  /** Called from gesture-engine 'direct-touch' event */
  handleDirectTouch(normX, normY) {
    if (!this._isOpen) return;
    const panelRect = this._panel.getBoundingClientRect();
    const px = normX * window.innerWidth;
    const py = normY * window.innerHeight;

    // Find which catalogue card is under the finger
    const cards = this._grid.querySelectorAll('.cat-item');
    let found = null;
    for (const card of cards) {
      const r = card.getBoundingClientRect();
      if (px >= r.left && px <= r.right && py >= r.top && py <= r.bottom) {
        found = card.dataset.id; break;
      }
    }
    this.setTouchHover(found);
  }

  /** Confirm the touch-hovering item (on tap) */
  confirmTouchHover() {
    if (this._touchHoverId) {
      const item = this._items.find(i => i.id === this._touchHoverId);
      if (item) this._selectItem(item);
      this.setTouchHover(null);
    }
  }

  toggle() { this._isOpen ? this.close() : this.open(); }

  open() {
    this._isOpen = true;
    this._panel.classList.remove('hidden');
    requestAnimationFrame(() => this._panel.classList.add('open'));
  }

  close() {
    this._isOpen = false;
    this._panel.classList.remove('open');
    setTimeout(() => this._panel.classList.add('hidden'), 400);
  }

  get isOpen() { return this._isOpen; }

  /** Return all items for a category */
  getItems(category) {
    return this._items.filter(i => i.category === category);
  }

  get activeCategory() { return this._activeCategory; }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function _capitalise(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function _categoryEmoji(cat) {
  return { glasses:'👓', shirt:'👕', hat:'🎩', watch:'⌚', bag:'👜' }[cat] ?? '📦';
}

function _fallbackItems() {
  return [
    { id:'glasses_01', category:'glasses', name:'Classic Oval',  modelUrl:'assets/models/glasses/glasses_01.glb', isNew:false },
    { id:'glasses_02', category:'glasses', name:'Aviator Gold',  modelUrl:'assets/models/glasses/glasses_02.glb', isNew:true  },
    { id:'glasses_03', category:'glasses', name:'Round Steel',   modelUrl:'assets/models/glasses/glasses_03.glb', isNew:false },
    { id:'glasses_04', category:'glasses', name:'Wayfarer',      modelUrl:'assets/models/glasses/glasses_04.glb', isNew:false },
    { id:'glasses_05', category:'glasses', name:'Cat-Eye',       modelUrl:'assets/models/glasses/glasses_05.glb', isNew:true  },
    { id:'shirt_01',   category:'shirt',   name:'White Formal',  modelUrl:'assets/models/shirts/shirt_01.glb',   isNew:false },
    { id:'shirt_02',   category:'shirt',   name:'Navy Casual',   modelUrl:'assets/models/shirts/shirt_02.glb',   isNew:false },
    { id:'shirt_03',   category:'shirt',   name:'Red Stripe',    modelUrl:'assets/models/shirts/shirt_03.glb',   isNew:true  },
    { id:'hat_01',     category:'hat',     name:'Black Cap',     modelUrl:'assets/models/hats/hat_01.glb',       isNew:false },
  ];
}
