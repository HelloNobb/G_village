// 메뉴(친밀도·설정·저장 초기화) + 첫 실행 이름 입력

export class Menu {
  constructor(scene) {
    this.scene = scene;
    this.modal = document.getElementById('menu-modal');
    this.nameModal = document.getElementById('name-modal');
    this.friendsEl = document.getElementById('menu-friends');
    this.ambientOpt = document.getElementById('opt-ambient');
    document.getElementById('menu-btn').addEventListener('click', (e) => { e.stopPropagation(); this.toggle(); });
    document.getElementById('menu-close').addEventListener('click', () => this.toggle(false));
    document.getElementById('menu-reset').addEventListener('click', () => {
      if (confirm('저장된 진행 상태(이름, 위치, 친밀도)를 모두 지울까요?')) {
        scene.save.reset();
        location.reload();
      }
    });
    this.ambientOpt.addEventListener('change', () => {
      scene.save.data.settings.ambientBubbles = this.ambientOpt.checked;
      scene.save.save();
    });
    for (const m of [this.modal, this.nameModal]) {
      m.addEventListener('pointerdown', (e) => e.stopPropagation());
      m.addEventListener('keydown', (e) => e.stopPropagation());
    }
    document.getElementById('name-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const v = document.getElementById('name-input').value.trim().slice(0, 10);
      if (!v) return;
      scene.save.data.player.name = v;
      scene.save.save();
      this.nameModal.classList.add('hidden');
      scene.input.keyboard.enabled = true;
    });
  }

  isOpen() {
    return !this.modal.classList.contains('hidden') || !this.nameModal.classList.contains('hidden');
  }

  askName() {
    this.nameModal.classList.remove('hidden');
    this.scene.input.keyboard.enabled = false;
    setTimeout(() => document.getElementById('name-input').focus(), 50);
  }

  toggle(force) {
    if (!this.nameModal.classList.contains('hidden')) return;
    const open = force ?? this.modal.classList.contains('hidden');
    this.modal.classList.toggle('hidden', !open);
    if (open) this.render();
  }

  render() {
    const sc = this.scene;
    this.ambientOpt.checked = sc.save.data.settings.ambientBubbles;
    const levels = ['처음 만남', '아는 사이', '친한 이웃', '단골 이웃'];
    this.friendsEl.innerHTML = '';
    const title = document.createElement('div');
    title.textContent = `${sc.save.data.player.name || '이웃'} 님의 이웃들`;
    title.style.cssText = 'font-weight:bold;margin-bottom:4px';
    this.friendsEl.append(title);
    for (const def of sc.npcData.residents) {
      const met = sc.save.hasMet(def.id);
      const lv = sc.save.familiarity(def.id);
      const row = document.createElement('div');
      row.className = 'friend';
      row.innerHTML = `<span class="dot" style="background:${def.color}"></span><span>${met ? def.name : '???'}</span><span style="color:#6f6878;font-size:12px">${met ? `${def.job} · ${levels[lv]}` : '아직 인사 못 함'}</span><span class="hearts">${'♥'.repeat(lv)}${'♡'.repeat(3 - lv)}</span>`;
      this.friendsEl.append(row);
    }
  }
}
