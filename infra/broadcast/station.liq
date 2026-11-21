# All per-station arguments are generated from a reviewed local manifest.
settings.log.file := false
settings.log.stdout := true
settings.harbor.bind_addrs := ["0.0.0.0"]

secret_dir = environment.get(default="/run/secrets", "BROADCAST_SECRETS_DIR")
source_password = string.trim(file.contents("#{secret_dir}/source"))
host = environment.get(default="icecast", "ICECAST_HOST")
port = int_of_string(default=8000, environment.get(default="8000", "ICECAST_PORT"))

studio_port = int_of_string(default=9000, environment.get(default="9000", "DJ_PORT"))

def station(slug, name, path, safety_track, fade) =
  rotation = playlist(mode="normal", reload_mode="never", path)
  automated = fallback(track_sensitive=false, [rotation, single(safety_track)])
  automated = if fade > 0. then crossfade(duration=fade, automated) else automated end
  program = if environment.get("DJ_ENABLED") == "1" then
    live = input.harbor(slug, port=studio_port, password=string.trim(file.contents("#{secret_dir}/dj")))
    fallback(track_sensitive=false, [live, automated])
  else
    automated
  end
  output.icecast(
    %mp3(bitrate=96, samplerate=44100, stereo=true),
    host=host, port=port, password=source_password, mount="/stream/#{slug}",
    name=name, description="Leonida FM independent broadcast", public=false,
    send_icy_metadata=true, connection_timeout=4., timeout=8.,
    program
  )
end
