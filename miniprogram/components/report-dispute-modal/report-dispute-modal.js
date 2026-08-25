Component({
  properties: { visible: { type: Boolean, value: false } },
  data: { reason: '' },
  methods: {
    noop() {},
    onInput(e) { this.setData({ reason: e.detail.value }); },
    cancel() { this.setData({ reason: '' }); this.triggerEvent('cancel'); },
    submit() {
      const reason = (this.data.reason || '').trim();
      if (!reason) return;
      this.setData({ reason: '' });
      this.triggerEvent('submit', { reason });
    },
  },
});
