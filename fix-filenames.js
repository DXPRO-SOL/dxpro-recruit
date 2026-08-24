const mongoose = require('mongoose');
const NewgradApplication = require('./models/NewgradApplication');
const CareerApplication = require('./models/CareerApplication');

mongoose.connect('mongodb+srv://dxprosol:kim650323@dxpro.ealx5.mongodb.net/dxpro-recruit').then(async () => {
  let fixed = 0;

  const fixName = (name) => {
    if (!name) return name;
    try {
      const decoded = Buffer.from(name, 'latin1').toString('utf8');
      if (decoded !== name && /[^\x00-\x7F]/.test(decoded)) return decoded;
    } catch(e) {}
    return name;
  };

  for (const Model of [NewgradApplication, CareerApplication]) {
    const apps = await Model.find({});
    for (const app of apps) {
      let changed = false;
      if (app.resumeFileName) {
        const f = fixName(app.resumeFileName);
        if (f !== app.resumeFileName) { app.resumeFileName = f; changed = true; console.log('resumeFileName:', f); }
      }
      if (app.careerFileName) {
        const f = fixName(app.careerFileName);
        if (f !== app.careerFileName) { app.careerFileName = f; changed = true; console.log('careerFileName:', f); }
      }
      if (app.portfolioFileIds && app.portfolioFileIds.length > 0) {
        app.portfolioFileIds.forEach(pf => {
          if (pf.fileName) {
            const f = fixName(pf.fileName);
            if (f !== pf.fileName) { pf.fileName = f; changed = true; console.log('portfolioFileName:', f); }
          }
        });
        app.markModified('portfolioFileIds');
      }
      if (changed) { await app.save(); fixed++; }
    }
  }
  console.log('Total apps fixed:', fixed);
  mongoose.disconnect();
});
