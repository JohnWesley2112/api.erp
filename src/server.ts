// server.ts
import app from "./app.js";
import userRoutes from "./modules/user/user.routes.js";
import authRoutes from "./modules/auth/auth.routes.js";
import { errorHandler } from "./errors/error.handler.js"; // ✅ central error handler
// import { authenticate } from "./middlewares/auth.middleware.js";

// Test route
app.get("/", (req, res) => {
    res.send("Hello");
});

// Register routes before error handler
app.use("/api/v1/auth", authRoutes);

// --- Everything below this line requires a login token ---
// app.use(authenticate);
app.use("/api/v1/users", userRoutes);

// ⚠️ Central error handler (Note: This MUST be the last middleware)
app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is up on port ${PORT}`);
});
