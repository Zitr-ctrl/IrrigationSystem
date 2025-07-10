export function ensureAuth(req, res, next) {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  next();
}

export function ensureAdmin(req, res, next) {
  if (!req.session.user || req.session.user.tipo_user_id !== 1) {
    return res.status(403).send('Acceso restringido a administradores');
  }
  next();
}
