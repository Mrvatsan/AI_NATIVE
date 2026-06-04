import { app } from './api/routes';
import dotenv from 'dotenv';
dotenv.config();

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`AI_NATIVE Server running on port ${PORT}`);
});
