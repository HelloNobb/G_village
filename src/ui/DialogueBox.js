// DOM 대화창. 타자기 효과, 클릭/Space/E 로 넘기기.

export class DialogueBox {
  constructor() {
    this.el = document.getElementById('dialog');
    this.nameEl = document.getElementById('dialog-name');
    this.textEl = document.getElementById('dialog-text');
    this.nextEl = document.getElementById('dialog-next');
    this.open = false;
    this.pages = [];
    this.idx = 0;
    this.typing = null;
    this.onClose = null;
    this.el.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.advance(); });
  }

  /**
   * @param {{name?:string, color?:string, pages:string[], narration?:boolean}} opts
   */
  show(opts, onClose) {
    this.open = true;
    this.pages = opts.pages;
    this.idx = 0;
    this.onClose = onClose ?? null;
    this.nameEl.textContent = opts.narration ? '' : (opts.name ?? '');
    this.el.style.setProperty('--name-color', opts.color ?? '#e8735a');
    this.el.classList.toggle('narration', !!opts.narration);
    this.el.classList.remove('hidden');
    this.render();
  }

  render() {
    const full = this.pages[this.idx] ?? '';
    clearInterval(this.typing);
    let n = 0;
    this.textEl.textContent = '';
    this.nextEl.classList.add('wait');
    this.typing = setInterval(() => {
      n += 2;
      this.textEl.textContent = full.slice(0, n);
      if (n >= full.length) this.finishTyping();
    }, 28);
  }

  finishTyping() {
    clearInterval(this.typing);
    this.typing = null;
    this.textEl.textContent = this.pages[this.idx] ?? '';
    this.nextEl.classList.remove('wait');
  }

  advance() {
    if (!this.open) return;
    if (this.typing) { this.finishTyping(); return; }
    this.idx++;
    if (this.idx >= this.pages.length) this.close();
    else this.render();
  }

  close() {
    clearInterval(this.typing);
    this.typing = null;
    this.open = false;
    this.el.classList.add('hidden');
    const cb = this.onClose;
    this.onClose = null;
    cb?.();
  }
}
