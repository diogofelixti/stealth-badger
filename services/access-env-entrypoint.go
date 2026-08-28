package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"syscall"
	"time"
)

func precisaBuscar(profile string) bool {
	switch profile {
	case "tailscale":
		return os.Getenv("TS_AUTHKEY") == ""
	case "cloudflared":
		return os.Getenv("TUNNEL_TOKEN") == ""
	default:
		fmt.Fprintf(os.Stderr, "perfil de acesso externo desconhecido: %s\n", profile)
		os.Exit(1)
		return false
	}
}

func carregar(profile string) {
	cliente := http.Client{Timeout: 10 * time.Second}
	url := "http://backend:3000/internal/access/config/" + profile + "/runtime-env"
	resp, err := cliente.Get(url)
	if err != nil {
		fmt.Fprintf(os.Stderr, "falha ao ler config de acesso externo: %v\n", err)
		os.Exit(1)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		fmt.Fprintf(os.Stderr, "config de acesso externo indisponivel: HTTP %d\n", resp.StatusCode)
		os.Exit(1)
	}

	var valores map[string]string
	if err := json.NewDecoder(resp.Body).Decode(&valores); err != nil {
		fmt.Fprintf(os.Stderr, "config de acesso externo invalida: %v\n", err)
		os.Exit(1)
	}
	for nome, valor := range valores {
		if valor != "" {
			_ = os.Setenv(nome, valor)
		}
	}
}

func main() {
	profile := os.Getenv("ACCESS_PROFILE")
	if profile == "" {
		fmt.Fprintln(os.Stderr, "ACCESS_PROFILE ausente")
		os.Exit(1)
	}
	if len(os.Args) < 2 {
		fmt.Fprintln(os.Stderr, "comando final ausente")
		os.Exit(1)
	}
	if precisaBuscar(profile) {
		carregar(profile)
	}

	caminho, err := exec.LookPath(os.Args[1])
	if err != nil {
		fmt.Fprintf(os.Stderr, "comando final nao encontrado: %v\n", err)
		os.Exit(1)
	}
	if err := syscall.Exec(caminho, os.Args[1:], os.Environ()); err != nil {
		fmt.Fprintf(os.Stderr, "falha ao executar comando final: %v\n", err)
		os.Exit(1)
	}
}
