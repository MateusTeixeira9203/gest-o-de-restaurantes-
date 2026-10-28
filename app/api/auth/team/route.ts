export function GET() {
  return Response.json({ error: 'Nao encontrado.' }, { status: 404 });
}

export { GET as POST, GET as PUT, GET as PATCH, GET as DELETE };
