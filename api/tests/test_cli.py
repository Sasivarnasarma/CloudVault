"""`python -m app`: what `pnpm dev` and `pnpm start` run."""

import pytest

from app import __main__ as cli
from app.core.config import settings


@pytest.fixture
def run(monkeypatch):
    """Capture what the command would start instead of starting a server."""
    calls = []
    monkeypatch.setattr(cli.uvicorn, "run", lambda *args, **kwargs: calls.append((args, kwargs)))
    monkeypatch.setattr(settings, "HOST", "127.0.0.1")
    monkeypatch.setattr(settings, "PORT", 8000)
    monkeypatch.setattr(settings, "WEB_DIST", None)
    monkeypatch.delenv("WEB_DIST", raising=False)
    return calls


@pytest.fixture
def built_web(tmp_path, monkeypatch):
    (tmp_path / "index.html").write_text("<div id='root'></div>")
    monkeypatch.setattr(cli, "CHECKOUT_WEB_DIST", tmp_path)
    return tmp_path


def test_starts_the_app_on_the_local_address_by_default(run):
    cli.main([])
    ((args, kwargs),) = run
    assert args == ("app.main:app",)
    assert (kwargs["host"], kwargs["port"]) == ("127.0.0.1", 8000)
    assert kwargs["reload"] is False and kwargs["reload_dirs"] is None


def test_the_address_comes_from_the_settings(run, monkeypatch):
    monkeypatch.setattr(settings, "HOST", "0.0.0.0")
    monkeypatch.setattr(settings, "PORT", 9000)
    cli.main([])
    assert (run[0][1]["host"], run[0][1]["port"]) == ("0.0.0.0", 9000)


def test_reload_watches_only_the_app_code(run):
    cli.main(["--reload"])
    kwargs = run[0][1]
    assert kwargs["reload"] is True
    assert kwargs["reload_dirs"] == [str(cli.API_DIR / "app")]


def test_serve_web_uses_the_checkouts_build(run, built_web):
    cli.main(["--serve-web"])
    assert settings.WEB_DIST == str(built_web.resolve())
    assert cli.os.environ["WEB_DIST"] == str(built_web.resolve())  # for a reloading child process
    assert len(run) == 1


def test_serve_web_prefers_a_configured_folder(run, built_web, tmp_path_factory, monkeypatch):
    other = tmp_path_factory.mktemp("elsewhere")
    (other / "index.html").write_text("<div id='root'></div>")
    monkeypatch.setattr(settings, "WEB_DIST", str(other))
    cli.main(["--serve-web"])
    assert settings.WEB_DIST == str(other.resolve())


def test_serve_web_without_a_build_says_what_to_do(run, tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(cli, "CHECKOUT_WEB_DIST", tmp_path / "missing")
    with pytest.raises(SystemExit) as stopped:
        cli.main(["--serve-web"])
    assert stopped.value.code == 2
    assert "pnpm build" in capsys.readouterr().err
    assert run == []  # nothing was started


def test_without_serve_web_the_web_app_is_left_to_vite(run, built_web):
    cli.main([])
    assert settings.WEB_DIST is None
