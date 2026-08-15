const styles = `
  body {
    margin: 0;
    background: #eef2f6;
  }

  .advertising-loading {
    min-height: 100vh;
    box-sizing: border-box;
    padding: 28px;
    background: #eef2f6;
    color: #10151b;
    font-family: Arial, Helvetica, sans-serif;
  }

  .advertising-loading-card {
    width: min(920px, 100%);
    box-sizing: border-box;
    margin: 0 auto;
    padding: 24px;
    border-radius: 8px;
    background: #10151b;
    color: #ffffff;
  }

  .advertising-loading-card p {
    margin: 0;
    color: #cbd3dd;
  }

  .advertising-loading-card h1 {
    margin: 6px 0 8px;
  }

  .advertising-loading-status {
    width: min(920px, 100%);
    box-sizing: border-box;
    margin: 18px auto 0;
    padding: 24px;
    border: 1px solid #dce3eb;
    border-radius: 8px;
    background: #ffffff;
  }
`;

export default function AdvertisingLoading() {
  return (
    <main className="advertising-loading">
      <style>{styles}</style>

      <header className="advertising-loading-card">
        <p>Jornada.pt</p>
        <h1>Publicidade</h1>
        <p>Uma única campanha para a Jornada e para as notícias.</p>
      </header>

      <section className="advertising-loading-status">
        A carregar a configuração da publicidade...
      </section>
    </main>
  );
}