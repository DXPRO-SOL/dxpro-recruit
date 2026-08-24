const mongoose = require('./node_modules/mongoose');
const PipelineSetting = require('./models/PipelineSetting');

mongoose.connect('mongodb+srv://dxprosol:kim650323@dxpro.ealx5.mongodb.net/dxpro-recruit').then(async () => {
  let setting = await PipelineSetting.findOne();
  if (!setting) {
    console.log('No setting found, will be created with default on next API call');
    mongoose.disconnect(); return;
  }
  const hasReceived = setting.stages.some(s => s.id === 'received' || s.name === '応募受付');
  if (!hasReceived) {
    setting.stages.forEach(s => { s.order += 1; });
    setting.stages.unshift({ id: 'received', name: '応募受付', color: 'teal', order: 0, isRejection: false });
    setting.markModified('stages');
    await setting.save();
    console.log('応募受付 stage added. Total stages:', setting.stages.length);
    setting.stages.forEach(s => console.log(' ', s.order, s.name, s.color));
  } else {
    console.log('応募受付 already exists');
  }
  mongoose.disconnect();
});
