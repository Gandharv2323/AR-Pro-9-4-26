/**
 * catalogue.js  — v2
 * FIXES:
 *   - load() gracefully handles 404 manifest.json
 *   - direct-touch hover uses element.getBoundingClientRect()
 *   - getItems() returns empty array (not undefined) safely
 *   - open/close animation handled via requestAnimationFrame (no timeout race)
 *   - tab buttons keyboard-focusable
 */

const CAT_EMOJI = { glasses: '👓', shirt: '👕', hat: '🎩', watch: '⌚', bag: '👜' };

export class Catalogue extends EventTarget {
  constructor() {
    super();
    this._panel    = document.getElementById('catalogue');
    this._tabs     = document.getElementById('catalogueTabs');
    this._grid     = document.getElementById('catalogueGrid');

    this._items     = [];
    this._activeCat = null;
    this._selectedId = null;
    this._hoverItemId = null;
    this._isOpen    = false;
  }

  /** Load manifest.json; fall back to built-in placeholder items on 404 */
  async load(manifestUrl = './manifest.json') {
    try {
      const res = await fetch(manifestUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      this._items = data.items ?? [];
    } catch (err) {
      console.warn('[Catalogue] manifest.json not found — using built-in items:', err.message);
      this._items = _builtInItems();
    }
    this._buildTabs();
    const first = this._categories()[0];
    if (first) this._showCategory(first);
  }

  _categories() {
    return [...new Set(this._items.map(i => i.category))];
  }

  _buildTabs() {
    this._tabs.innerHTML = '';
    for (const cat of this._categories()) {
      const btn = document.createElement('button');
      btn.className = 'tab-btn';
      btn.dataset.cat = cat;
      btn.textContent = `${CAT_EMOJI[cat] ?? '📦'} ${_cap(cat)}`;
      btn.addEventListener('click', () => this._showCategory(cat));
      this._tabs.appendChild(btn);
    }
  }

  _showCategory(cat) {
    this._activeCat = cat;

    // Update tab active state
    this._tabs.querySelectorAll('.tab-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.cat === cat);
    });

    // Rebuild grid
    this._grid.innerHTML = '';
    const items = this._items.filter(i => i.category === cat);

    for (const item of items) {
      const card = document.createElement('div');
      card.className = 'cat-item';
      card.dataset.id = item.id;
      if (item.id === this._selectedId) card.classList.add('selected');

      // Thumbnail
      const thumb = document.createElement('div');
      thumb.className = 'cat-thumb';
      if (item.thumbnail) {
        const img = new Image();
        img.src = item.thumbnail;
        img.alt = item.name;
        img.style = 'width:85%;height:85%;object-fit:contain';
        img.onerror = () => { thumb.textContent = CAT_EMOJI[item.category] ?? '📦'; };
        thumb.appendChild(img);
      } else {
        thumb.textContent = CAT_EMOJI[item.category] ?? '📦';
        thumb.style.fontSize = '52px';
      }

      // Name
      const name = document.createElement('div');
      name.className = 'cat-name';
      name.textContent = item.name;

      if (item.isNew) {
        const badge = document.createElement('span');
        badge.className = 'cat-badge';
        badge.textContent = 'NEW';
        card.appendChild(badge);
      }

      card.appendChild(thumb);
      card.appendChild(name);
      card.addEventListener('click', () => this._selectItem(item));
      this._grid.appendChild(card);
    }

    this.dispatchEvent(new CustomEvent('category-change', { detail: { category: cat } }));
  }

  _selectItem(item) {
    this._selectedId = item.id;
    this._grid.querySelectorAll('.cat-item').forEach(c => {
      c.classList.toggle('selected', c.dataset.id === item.id);
    });
    this.dispatchEvent(new CustomEvent('item-select', { detail: { item } }));
  }

  /** Confirm the currently touch-hovered item (called on tap gesture) */
  confirmTouchHover() {
    if (!this._hoverItemId) return;
    const item = this._items.find(i => i.id === this._hoverItemId);
    if (item) this._selectItem(item);
    this._setHoverItem(null);
  }

  /** Called by gesture engine direct-touch event */
  handleDirectTouch(normX, normY) {
    if (!this._isOpen) return;
    const px = normX * window.innerWidth;
    const py = normY * window.innerHeight;

    let found = null;
    for (const card of this._grid.querySelectorAll('.cat-item')) {
      const r = card.getBoundingClientRect();
      if (px >= r.left && px <= r.right && py >= r.top && py <= r.bottom) {
        found = card.dataset.id;
        break;
      }
    }
    this._setHoverItem(found);
  }

  _setHoverItem(id) {
    if (this._hoverItemId === id) return;
    this._hoverItemId = id;
    this._grid.querySelectorAll('.cat-item').forEach(c => {
      c.classList.toggle('touch-hover', c.dataset.id === id);
    });
  }

  toggle() { this._isOpen ? this.close() : this.open(); }

  open() {
    if (this._isOpen) return;
    this._isOpen = true;
    this._panel.classList.remove('hidden');
    // RAF to allow display:block to apply before transition
    requestAnimationFrame(() => requestAnimationFrame(() => {
      this._panel.classList.add('open');
    }));
  }

  close() {
    if (!this._isOpen) return;
    this._isOpen = false;
    this._panel.classList.remove('open');
    // Match transition duration (400ms)
    setTimeout(() => {
      if (!this._isOpen) this._panel.classList.add('hidden');
    }, 420);
  }

  getItems(category) {
    return this._items.filter(i => i.category === category);
  }

  get isOpen()        { return this._isOpen; }
  get activeCategory(){ return this._activeCat; }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function _cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : ''; }

function _builtInItems() {
  return [
    { id:'glasses_01', category:'glasses', name:'Stylized Eyeglasses', modelUrl:'assets/models/glasses/glasses_01.glb', isNew:true  },
    { id:'glasses_02', category:'glasses', name:'Classic Oval (3D)',    modelUrl:'assets/models/glasses/glasses_02.glb', isNew:false },
    { id:'glasses_03', category:'glasses', name:'Aviator Gold',         modelUrl:'assets/models/glasses/glasses_03.glb', isNew:false },
    { id:'glasses_04', category:'glasses', name:'Wayfarer',             modelUrl:'assets/models/glasses/glasses_04.glb', isNew:false },
    { id:'shirt_01',   category:'shirt',   name:'Stylized Hoodie',      modelUrl:'assets/models/shirts/shirt_01.glb',   isNew:true  },
    { id:'shirt_02',   category:'shirt',   name:'XD Full Outfit',       modelUrl:'assets/models/shirts/shirt_02.glb',   isNew:true  },
    { id:'hat_01',     category:'hat',     name:'Black Cap',             modelUrl:'assets/models/hats/hat_01.glb',      isNew:false },
  ];
}
