Component({
  properties: {
    title: { type: String, value: '' },
    preview: { type: String, value: '' },
    moduleKey: { type: String, value: '' },   // breakpoint | rootcause | hook | check
    index: { type: Number, value: 0 },        // weakpoints 下标
    autoOpen: { type: Boolean, value: false }, // 渐进解锁：为 true 时自动展开该模块
  },
  data: { open: false },
  lifetimes: {
    attached() {
      if (this.data.autoOpen) this.setData({ open: true });
    },
  },
  observers: {
    'autoOpen(v)': function (v) {
      if (v) this.setData({ open: true });
    },
  },
  methods: {
    toggle() { this.setData({ open: !this.data.open }); },
    onDispute() {
      this.triggerEvent('dispute', { moduleKey: this.data.moduleKey, index: this.data.index });
    },
  },
});
