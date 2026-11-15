/* Small local prototype editor. Only the existing supported document grammar is serialized. */
'use strict';
window.WikiArticleRichEditor = class WikiArticleRichEditor {
  constructor(root, options) {
    this.root = root;
    this.options = options;
    this.range = null;
    this.source = '';
    this.dirty = false;
    this.composing = false;
    this.onSelection = () => this.remember();
    document.addEventListener('selectionchange', this.onSelection);
    root.addEventListener('input', () => {
      this.dirty = true;
      this.remember();
      if (!this.composing) options.onChange();
    });
    root.addEventListener('compositionstart', () => { this.composing = true; });
    root.addEventListener('compositionend', () => { this.composing = false; this.dirty = true; options.onChange(); });
    root.addEventListener('paste', event => {
      event.preventDefault();
      // Paste text only; arbitrary HTML never becomes executable editor content.
      const text = event.clipboardData?.getData('text/plain') || '';
      document.execCommand('insertText', false, text);
    });
    root.addEventListener('drop', event => event.preventDefault());
    root.addEventListener('click', event => {
      const action = event.target.closest('[data-rich-action]');
      if (!action) return;
      event.preventDefault();
      const atom = action.closest('[data-rich-ref],[data-rich-media]');
      if (action.dataset.richAction === 'remove') this.removeAtom(atom);
      else if (action.dataset.richAction === 'view') options.onEntity(atom.dataset.richRef, atom.dataset.name);
      else if (action.dataset.richAction === 'edit-image') options.onEditImage(atom);
    });
  }

  destroy() { document.removeEventListener('selectionchange', this.onSelection); }

  setMarkdown(source) {
    this.source = source;
    this.dirty = false;
    this.range = null;
    const template = document.createElement('template');
    template.innerHTML = this.options.render(source);
    template.content.querySelectorAll('.inline-ref').forEach(button => {
      const holder = document.createElement('template');
      holder.innerHTML = this.referenceHtml(button.dataset.entity, button.dataset.label, 'inline');
      button.replaceWith(holder.content);
    });
    template.content.querySelectorAll('.entity-card').forEach(button => {
      const holder = document.createElement('template');
      holder.innerHTML = this.referenceHtml(button.dataset.entity, button.dataset.label, 'card');
      button.replaceWith(holder.content);
    });
    template.content.querySelectorAll('.article-figure').forEach(figure => {
      const holder = document.createElement('template');
      holder.innerHTML = this.imageHtml(figure.dataset.media, figure.querySelector('img')?.getAttribute('src'), figure.querySelector('figcaption')?.textContent || '');
      figure.replaceWith(holder.content);
    });
    this.root.replaceChildren(template.content);
    if (!source.trim()) this.root.innerHTML = '<p><br></p>';
    if (this.root.lastElementChild?.matches('[data-rich-ref],[data-rich-media]')) this.root.insertAdjacentHTML('beforeend', '<p><br></p>');
  }

  referenceHtml(key, label, display) {
    return this.options.referenceHtml(key, label, display);
  }

  imageHtml(id, src, caption) {
    return this.options.imageHtml(id, src, caption);
  }

  remember() {
    const selection = document.getSelection();
    if (!selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (this.root.contains(range.commonAncestorContainer)) this.range = range.cloneRange();
  }

  restore() {
    let range = this.range;
    this.root.focus({preventScroll:true});
    const selection = document.getSelection();
    if (!range || !this.root.contains(range.commonAncestorContainer)) {
      range = document.createRange();
      range.selectNodeContents(this.root);
      range.collapse(false);
    }
    const parent = range.startContainer.nodeType === Node.ELEMENT_NODE ? range.startContainer : range.startContainer.parentElement;
    const caption = parent?.closest('figcaption');
    if (caption) {
      range = document.createRange();
      range.setStartAfter(caption.closest('figure'));
      range.collapse(true);
    }
    selection.removeAllRanges();
    selection.addRange(range);
  }

  insertHtml(html) {
    const originalSource = this.getMarkdown();
    const before = this.root.innerHTML;
    this.restore();
    document.execCommand('insertHTML', false, html);
    // Some hosts report false after an actual edit; verify the edited DOM.
    if (this.root.innerHTML === before) {
      this.options.onFailure?.('没有成功插入内容，请在正文中重新放置光标后再试。');
      return false;
    }
    this.dirty = true;
    if (this.getMarkdown().length > 30000) {
      document.execCommand('undo');
      this.source = originalSource;
      this.dirty = false;
      this.options.onFailure?.('正文最多 30000 字，请精简后再插入。');
      this.remember();
      return false;
    }
    this.remember();
    this.options.onChange();
    return true;
  }

  insertReference(key, label, display) {
    return this.insertHtml(display === 'card' ? this.referenceHtml(key, label, display) + '<p><br></p>' : this.referenceHtml(key, label, display) + '&#8203;');
  }

  insertImage(id, src, caption) {
    return this.insertHtml(this.imageHtml(id, src, caption) + '<p><br></p>');
  }

  removeAtom(atom) {
    if (!atom) return;
    this.root.focus({preventScroll:true});
    const range = document.createRange();
    range.selectNode(atom);
    const selection = document.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    document.execCommand('delete');
    this.dirty = true;
    this.remember();
    this.options.onChange();
  }

  format(kind) {
    this.restore();
    if (kind === 'bold') document.execCommand('bold');
    else if (kind === 'list') document.execCommand('insertUnorderedList');
    else document.execCommand('formatBlock', false, 'h2');
    this.dirty = true;
    this.remember();
    this.options.onChange();
  }

  getMarkdown() {
    if (!this.dirty) return this.source;
    const label = text => text.replace(/\\/g,'\\\\').replace(/\[/g,'\\[').replace(/\]/g,'\\]').replace(/[\r\n]/g,' ');
    const walk = node => {
      if (node.nodeType === Node.TEXT_NODE) return node.textContent.replace(/\u200b/g,'');
      if (node.nodeType !== Node.ELEMENT_NODE) return '';
      if (node.dataset.richRef) {
        const token = node.dataset.richRef + '|' + node.dataset.name;
        return node.dataset.display === 'card' ? '\n\n{{' + token + '}}\n\n' : '[[' + token + ']]';
      }
      if (node.dataset.richMedia) {
        const caption = node.querySelector('figcaption')?.textContent || '';
        return '\n\n![' + label(caption) + '](media:' + node.dataset.richMedia + ')\n\n';
      }
      const inside = [...node.childNodes].map(walk).join('');
      switch (node.tagName) {
        case 'BR': return '\n';
        case 'B': case 'STRONG': return node.querySelector('[data-display="card"],[data-rich-media]') ? inside : '**' + inside + '**';
        case 'H2': return '\n\n## ' + inside.trim() + '\n\n';
        case 'H3': return '\n\n### ' + inside.trim() + '\n\n';
        case 'BLOCKQUOTE': return '\n\n' + inside.trim().split('\n').filter(Boolean).map(line=>'> ' + line).join('\n') + '\n\n';
        case 'LI': return '- ' + inside.trim() + '\n';
        case 'UL': case 'OL': return '\n\n' + inside + '\n';
        case 'P': case 'DIV': return '\n\n' + inside + '\n\n';
        default: return inside;
      }
    };
    return [...this.root.childNodes].map(walk).join('').replace(/\n{3,}/g,'\n\n').trim();
  }
}
