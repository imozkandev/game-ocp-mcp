using System.Collections.Generic;
using System.Linq;
using UnityEngine;

public class BadPlayerController : MonoBehaviour
{
    public float moveSpeed = 5f;
    public Transform target;
    public string playerName = "Player";
    public List<GameObject> enemies = new List<GameObject>();

    private void Update()
    {
        var status = "Player: " + playerName;
        var activeEnemies = enemies.Where(enemy => enemy != null && enemy.activeSelf).ToList();
        var direction = new Vector3(target.position.x, 0f, target.position.z) - transform.position;
        var body = GetComponent<Rigidbody>();

        if (GameObject.Find("MainCamera") != null)
        {
            body.MovePosition(transform.position + direction.normalized * moveSpeed * Time.deltaTime);
        }

        Debug.Log(status + " | Active enemies: " + activeEnemies.Count);
    }
}
