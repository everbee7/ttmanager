package store

import (
	"context"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type MongoMirror struct {
	client     *mongo.Client
	collection *mongo.Collection
}

func NewMongoMirror(ctx context.Context, uri, dbName string) (*MongoMirror, error) {
	client, err := mongo.Connect(ctx, options.Client().ApplyURI(uri))
	if err != nil {
		return nil, err
	}
	if err := client.Ping(ctx, nil); err != nil {
		_ = client.Disconnect(ctx)
		return nil, err
	}
	return &MongoMirror{client: client, collection: client.Database(dbName).Collection("ttmanager_state")}, nil
}

func (m *MongoMirror) Close(ctx context.Context) error {
	if m == nil || m.client == nil {
		return nil
	}
	return m.client.Disconnect(ctx)
}

func (m *MongoMirror) SaveSnapshot(ctx context.Context, snapshot Snapshot) error {
	if m == nil {
		return nil
	}
	_, err := m.collection.UpdateOne(ctx, bson.M{"_id": "local"}, bson.M{"$set": bson.M{
		"snapshot":       snapshot,
		"updated_at_utc": time.Now().UTC(),
	}}, options.Update().SetUpsert(true))
	return err
}
