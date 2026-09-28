using System.Collections.Generic;
using UnityEngine;

public class CleanPlayerController : MonoBehaviour
{
    [SerializeField] private float moveSpeed = 5f;
    [SerializeField] private Transform target;
    [SerializeField] private string playerName = "Player";
    [SerializeField] private List<GameObject> enemies = new List<GameObject>();

    private Rigidbody cachedBody;
    private Camera cachedMainCamera;
    private string lastPlayerName;
    private int activeEnemyCount;

    private void Awake()
    {
        cachedBody = GetComponent<Rigidbody>();
        cachedMainCamera = Camera.main;
        lastPlayerName = playerName;
    }

    private void Update()
    {
        activeEnemyCount = 0;
        for (var index = 0; index < enemies.Count; index += 1)
        {
            var enemy = enemies[index];
            if (enemy != null && enemy.activeSelf) activeEnemyCount += 1;
        }

        var direction = target.position - transform.position;
        if (cachedMainCamera != null)
        {
            cachedBody.MovePosition(transform.position + direction.normalized * moveSpeed * Time.deltaTime);
        }

        if (lastPlayerName != playerName)
        {
            lastPlayerName = playerName;
            RefreshPlayerStatus();
        }
    }

    private void RefreshPlayerStatus()
    {
        Debug.Log($"Player: {playerName} | Active enemies: {activeEnemyCount}");
    }
}
